import prisma from '../prisma';
import { getTransactionConfirmations } from './blockchainService';
import { sendPaymentConfirmedEmail } from './emailService';

const REQUIRED_CONFIRMATIONS = parseInt(process.env.REQUIRED_CONFIRMATIONS || '12');
const monitoringJobs = new Map<string, NodeJS.Timeout>();

export async function startConfirmationMonitoring(
    orderId: string,
    txHash: string,
    chain: string,
    io?: any
) {
    // Prevent duplicate monitoring
    if (monitoringJobs.has(orderId)) {
        return;
    }

    console.log(`Starting confirmation monitoring for order ${orderId}`);

    const intervalId = setInterval(async () => {
        try {
            const confirmations = await getTransactionConfirmations(txHash, chain);

            // Update database
            await prisma.order.update({
                where: { orderId },
                data: { confirmations }
            });

            // Emit WebSocket event
            if (io) {
                io.to(orderId).emit('confirmation-update', { confirmations, required: REQUIRED_CONFIRMATIONS });
            }

            console.log(`Order ${orderId}: ${confirmations}/${REQUIRED_CONFIRMATIONS} confirmations`);

            // Check if threshold reached
            if (confirmations >= REQUIRED_CONFIRMATIONS) {
                const order = await prisma.order.update({
                    where: { orderId },
                    data: {
                        status: 'PAYMENT_CONFIRMED',
                        confirmedAt: new Date()
                    }
                });

                // Send confirmation email
                try {
                    await sendPaymentConfirmedEmail(
                        order.customerEmail,
                        orderId,
                        order.totalAmount.toString(),
                        txHash
                    );
                } catch (emailError) {
                    console.error('Failed to send confirmation email:', emailError);
                }

                // Emit final event
                if (io) {
                    io.to(orderId).emit('payment-confirmed', { orderId, confirmations });
                }

                // Stop monitoring
                stopConfirmationMonitoring(orderId);
            }
        } catch (error) {
            console.error(`Error monitoring confirmations for ${orderId}:`, error);
        }
    }, 30000); // Check every 30 seconds

    monitoringJobs.set(orderId, intervalId);
}

export function stopConfirmationMonitoring(orderId: string) {
    const intervalId = monitoringJobs.get(orderId);
    if (intervalId) {
        clearInterval(intervalId);
        monitoringJobs.delete(orderId);
        console.log(`Stopped confirmation monitoring for order ${orderId}`);
    }
}

export function getActiveMonitoringJobs(): string[] {
    return Array.from(monitoringJobs.keys());
}
