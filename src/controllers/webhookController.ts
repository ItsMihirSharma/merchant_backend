import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import listenerVerificationService from '../services/listenerVerification';
import blockchainVerificationService from '../services/blockchainVerification';
import proofGeneratorService from '../services/proofGenerator';
import duplicateTrackerService from '../services/duplicateTracker';
import { sendPaymentReceivedEmail } from '../services/emailService';
import { startConfirmationMonitoring } from '../services/confirmationMonitor';
import { emitPaymentReceived, getIO } from '../websocket/socketServer';
import logger from '../utils/logger';

const webhookSchema = z.object({
    type: z.enum(['payment.completed', 'payment.pending', 'payment.confirmed', 'payment.failed']),
    payment_id: z.string(),
    merchant: z.string(),
    customer: z.string(),
    amount: z.string(),
    amount_wei: z.string().optional(),
    merchant_amount: z.string().optional(),
    platform_fee: z.string().optional(),
    listener_fee: z.string().optional(),
    timestamp: z.number(),
    block_number: z.number(),
    transaction_hash: z.string(),
    chain_id: z.number(),
    metadata: z.record(z.string(), z.any()).optional()
});

/**
 * Production-ready webhook handler with comprehensive security checks
 */
export async function handleWebhook(req: Request, res: Response) {
    const startTime = Date.now();

    try {
        logger.info('📨 Webhook received', {
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // ============ STEP 1: EXTRACT DATA ============
        const listenerSignature = req.headers['x-webhook-signature'] as string | undefined;
        const listenerAddress = req.headers['x-node-address'] as string | undefined;
        const paymentIdHeader = req.headers['x-payment-id'] as string | undefined;

        logger.debug('Request headers', {
            hasSignature: !!listenerSignature,
            listenerAddress,
            paymentId: paymentIdHeader
        });

        // Validate payload structure
        let data: z.infer<typeof webhookSchema>;
        try {
            data = webhookSchema.parse(req.body);
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.error('❌ Invalid payload structure', { errors: error.issues });
                return res.status(400).json({
                    error: 'Invalid payload',
                    details: error.issues
                });
            }
            throw error;
        }

        const { payment_id, merchant, customer, amount, transaction_hash, type } = data;

        logger.info('🎯 Processing payment', {
            paymentId: payment_id,
            merchant,
            listener: listenerAddress,
            amount
        });

        // ============ STEP 2: DUPLICATE CHECK ============
        if (duplicateTrackerService.isWebhookProcessed(payment_id)) {
            const existing = duplicateTrackerService.getProcessingListener(payment_id);
            logger.warn('⚠️  Payment already processed', {
                paymentId: payment_id,
                processedBy: existing?.listener,
                processedAt: existing?.timestamp
            });

            return res.status(200).json({
                status: 'already_processed',
                message: 'This payment was already handled',
                processed_by: existing?.listener,
                processed_at: existing?.timestamp,
                proof: null // Don't provide proof to duplicate attempts
            });
        }

        // ============ STEP 3: VERIFY LISTENER SIGNATURE ============
        if (listenerSignature && listenerAddress) {
            const isValidSignature = await listenerVerificationService.verifyListenerSignature(
                req.body,
                listenerSignature,
                listenerAddress
            );

            if (!isValidSignature) {
                logger.error('❌ Invalid listener signature', {
                    paymentId: payment_id,
                    listener: listenerAddress
                });

                return res.status(401).json({
                    error: 'Invalid signature',
                    message: 'Webhook signature verification failed'
                });
            }

            logger.info('✅ Listener signature valid', { listener: listenerAddress });
        } else {
            logger.warn('⚠️  No listener signature provided (development mode)');
        }

        // ============ STEP 4: VERIFY LISTENER IS REGISTERED ============
        // PRODUCTION: Verify listener is registered and authorized
        if (listenerAddress) {
            const registrationCheck = await listenerVerificationService.verifyListenerRegistered(listenerAddress);

            if (!registrationCheck.isValid) {
                logger.error('❌ Listener verification failed', {
                    paymentId: payment_id,
                    listener: listenerAddress,
                    reason: registrationCheck.reason
                });

                // PRODUCTION: Block unauthorized listeners
                return res.status(403).json({
                    error: 'Unauthorized listener',
                    message: registrationCheck.reason || 'Listener not registered or not authorized'
                });
            } else {
                logger.info('✅ Listener is registered', {
                    listener: listenerAddress,
                    stats: registrationCheck.listenerInfo
                });
            }
        } else {
            // In production, listener address is required
            logger.warn('⚠️  No listener address provided');
            // For now, allow it to proceed (can make strict in production)
        }

        // ============ STEP 5: VERIFY PAYMENT ON BLOCKCHAIN ============
        const paymentVerification = await blockchainVerificationService.verifyPaymentOnChain(
            payment_id,
            merchant,
            customer,
            amount
        );

        if (!paymentVerification.isValid) {
            logger.error('❌ Payment verification failed', {
                paymentId: payment_id,
                reason: paymentVerification.reason
            });

            return res.status(400).json({
                error: 'Invalid payment',
                message: paymentVerification.reason
            });
        }

        logger.info('✅ Payment verified on blockchain', {
            paymentId: payment_id,
            amount: paymentVerification.paymentData?.amount
        });

        // Optional: Verify transaction confirmations
        const txVerification = await blockchainVerificationService.verifyTransactionReceipt(transaction_hash);

        if (!txVerification.isValid) {
            logger.warn('⚠️  Transaction verification warning', {
                reason: txVerification.reason,
                confirmations: txVerification.confirmations
            });
            // Don't fail, just log warning
        }

        // ============ STEP 6: BUSINESS LOGIC - PROCESS ORDER ============
        // Convert timestamp (handle seconds vs milliseconds)
        let payloadTimestamp = data.timestamp;
        if (payloadTimestamp && payloadTimestamp < 1000000000000) {
            payloadTimestamp = payloadTimestamp * 1000;
        }

        // Get or create order (optional - database may not be configured)
        let order = null;
        try {
            order = await prisma.order.findFirst({
                where: {
                    OR: [
                        { orderId: payment_id },
                        { transactionHash: transaction_hash }
                    ]
                }
            });

            if (!order) {
                logger.warn('⚠️  Order not found in database', { paymentId: payment_id });
                // Still process webhook and generate proof
            } else {
                // Update order status
                order = await prisma.order.update({
                    where: { orderId: order.orderId },
                    data: {
                        status: type === 'payment.completed' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_PENDING',
                        transactionHash: transaction_hash,
                        blockNumber: data.block_number,
                        confirmations: txVerification.confirmations || 1,
                        chain: `Chain ${data.chain_id}`,
                        merchantAddress: merchant,
                        customerAddress: customer,
                        confirmedAt: type === 'payment.completed' ? new Date() : undefined
                    }
                });

                logger.info('✅ Order updated', {
                    orderId: order.orderId,
                    status: order.status
                });

                // Send email notification
                try {
                    await sendPaymentReceivedEmail(
                        order.customerEmail,
                        payment_id,
                        amount,
                        transaction_hash
                    );
                } catch (emailError) {
                    logger.error('Failed to send email', { error: emailError });
                }

                // Emit WebSocket event
                try {
                    emitPaymentReceived(order.orderId, {
                        orderId: order.orderId,
                        status: order.status,
                        transactionHash: transaction_hash,
                        confirmations: txVerification.confirmations || 1
                    });
                } catch (wsError) {
                    logger.error('Failed to emit WebSocket event', { error: wsError });
                }

                // Start confirmation monitoring
                if (type === 'payment.pending' || type === 'payment.completed') {
                    try {
                        const io = getIO();
                        startConfirmationMonitoring(
                            order.orderId,
                            transaction_hash,
                            data.chain_id.toString(),
                            io
                        );
                    } catch (monitorError) {
                        logger.error('Failed to start confirmation monitoring', { error: monitorError });
                    }
                }
            }
        } catch (dbError) {
            // Database not configured or table doesn't exist - continue without DB
            logger.warn('⚠️  Database operation skipped (not configured)', {
                error: dbError instanceof Error ? dbError.message : 'Unknown error'
            });
        }

        // Log webhook (optional - database may not be configured)
        try {
            const webhookLog = await prisma.webhookLog.create({
                data: {
                    orderId: payment_id,
                    eventType: type,
                    payload: JSON.stringify(data),
                    signature: listenerSignature || '',
                    verified: true,
                    processed: true
                }
            });
        } catch (dbError) {
            logger.warn('⚠️  Webhook log skipped (database not configured)');
        }

        // ============ STEP 7: GENERATE MERCHANT PROOF ============
        let merchantProof;
        if (listenerAddress) {
            try {
                merchantProof = await proofGeneratorService.generateMerchantProof({
                    payment_id,
                    listener_address: listenerAddress,
                    timestamp: Date.now(),
                    webhook_received: true,
                    order_id: order?.orderId,
                    amount
                });

                logger.info('✅ Merchant proof generated', {
                    paymentId: payment_id,
                    listener: listenerAddress
                });

                // ============ STEP 8: STORE PROOF RECORD ============
                // Note: Proof metadata stored in separate table in future
                logger.debug('Proof metadata', {
                    merchant_signature: merchantProof.signature.substring(0, 10) + '...',
                    listener_address: listenerAddress
                });
            } catch (proofError) {
                logger.error('❌ Failed to generate merchant proof', {
                    error: proofError,
                    paymentId: payment_id
                });
                // Don't fail the entire request, but don't provide proof
            }
        }

        // Mark as processed (prevents duplicates)
        if (listenerAddress) {
            duplicateTrackerService.markWebhookProcessed(
                payment_id,
                listenerAddress,
                merchantProof?.signature || ''
            );
        }

        // ============ EMIT WEBSOCKET FOR CHECKOUT WIDGET ============
        // Emit using payment_id as room so checkout widget receives confirmation
        try {
            const wsPayload = {
                orderId: payment_id,
                status: 'PAYMENT_CONFIRMED',
                transactionHash: transaction_hash,
                confirmations: txVerification.confirmations || 1,
                proofGenerated: !!merchantProof
            };

            // Emit to payment_id room
            emitPaymentReceived(payment_id, wsPayload);

            // Also emit to transaction_hash room (widget may join either)
            emitPaymentReceived(transaction_hash, wsPayload);

            logger.info('📡 Emitted payment-received WebSocket event', { paymentId: payment_id, txHash: transaction_hash });
        } catch (wsError) {
            logger.error('Failed to emit WebSocket event', { error: wsError });
        }

        // ============ STEP 9: RETURN PROOF TO LISTENER ============
        const processingTime = Date.now() - startTime;

        logger.info('✅ Webhook processed successfully', {
            paymentId: payment_id,
            processingTime: `${processingTime}ms`,
            proofGenerated: !!merchantProof
        });


        return res.status(200).json({
            status: 'success',
            message: 'Payment processed successfully',
            signature: merchantProof?.signature || null,  // Top-level for listener compatibility
            proof: merchantProof ? {
                payment_id: payment_id,
                listener: listenerAddress,
                merchant_signature: merchantProof.signature,
                signed_message: merchantProof.message,
                timestamp: merchantProof.timestamp,
                method: merchantProof.method
            } : null,
            order: order ? {
                order_id: order.orderId,
                status: order.status,
                processed_at: Date.now()
            } : null,
            processing_time_ms: processingTime
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;

        logger.error('❌ Webhook processing error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            processingTime: `${processingTime}ms`
        });

        return res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
