import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '../config/contracts';
import logger from '../utils/logger';

/**
 * Service to verify payments by querying PaymentCompleted events from blockchain
 * Replaces PaymentDatabase with events-only architecture
 */
class EventVerificationService {
    private provider: ethers.JsonRpcProvider;
    private paymentRouterAddress: string;
    private paymentRouterAbi: string[];

    constructor() {
        this.provider = new ethers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
        this.paymentRouterAddress = process.env.PAYMENT_ROUTER_ADDRESS || '0x60a13C4C324f9d080eede15eb976599F9D0cD0ce';

        // Minimal ABI for PaymentCompleted event
        this.paymentRouterAbi = [
            'event PaymentCompleted(bytes32 indexed paymentId, address indexed merchant, uint256 merchantAmount, uint256 platformFee, uint256 listenerFee)'
        ];
    }

    /**
     * Verify payment exists by querying PaymentCompleted events
     */
    async verifyPaymentEvent(
        paymentId: string,
        merchant: string,
        customer: string,
        amount: string
    ): Promise<{
        isValid: boolean;
        reason?: string;
        eventData?: any;
    }> {
        try {
            logger.info('Verifying payment via blockchain events', { paymentId, merchant });

            const paymentRouter = new ethers.Contract(
                this.paymentRouterAddress,
                this.paymentRouterAbi,
                this.provider
            );

            // Query PaymentCompleted events for this payment ID
            const filter = paymentRouter.filters.PaymentCompleted(paymentId, merchant);

            // Search last 10000 blocks (adjust based on network)
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 10000);

            logger.debug('Querying events', { fromBlock, currentBlock, paymentId });

            const events = await paymentRouter.queryFilter(filter, fromBlock, currentBlock);

            if (events.length === 0) {
                logger.warn('Payment event not found', { paymentId, merchant, fromBlock, currentBlock });
                return {
                    isValid: false,
                    reason: 'Payment event not found in blockchain logs'
                };
            }

            const event = events[0];

            // Type guard for EventLog
            if (!('args' in event)) {
                return {
                    isValid: false,
                    reason: 'Invalid event format'
                };
            }

            const eventArgs = event.args;

            logger.debug('Payment event found', {
                paymentId: eventArgs.paymentId,
                merchant: eventArgs.merchant,
                merchantAmount: ethers.formatEther(eventArgs.merchantAmount),
                blockNumber: event.blockNumber
            });

            // Verify merchant matches
            if (eventArgs.merchant.toLowerCase() !== merchant.toLowerCase()) {
                return {
                    isValid: false,
                    reason: `Merchant address mismatch. Expected: ${merchant}, Got: ${eventArgs.merchant}`
                };
            }

            // Get transaction receipt for confirmation count
            const receipt = await event.getTransactionReceipt();
            const confirmations = currentBlock - receipt.blockNumber;

            logger.debug('Transaction confirmations', { confirmations, blockNumber: receipt.blockNumber });

            // Require minimum confirmations (configurable)
            const minConfirmations = parseInt(process.env.MIN_CONFIRMATIONS || '3');
            if (confirmations < minConfirmations) {
                return {
                    isValid: false,
                    reason: `Insufficient confirmations: ${confirmations}/${minConfirmations}`
                };
            }

            // Calculate total amount from event
            const totalAmount = eventArgs.merchantAmount + eventArgs.platformFee + eventArgs.listenerFee;
            const totalAmountEth = ethers.formatEther(totalAmount);

            logger.info('✅ Payment verified via events', {
                paymentId,
                merchant: eventArgs.merchant,
                totalAmount: totalAmountEth,
                confirmations
            });

            return {
                isValid: true,
                eventData: {
                    paymentId: eventArgs.paymentId,
                    merchant: eventArgs.merchant,
                    merchantAmount: ethers.formatEther(eventArgs.merchantAmount),
                    platformFee: ethers.formatEther(eventArgs.platformFee),
                    listenerFee: ethers.formatEther(eventArgs.listenerFee),
                    totalAmount: totalAmountEth,
                    blockNumber: receipt.blockNumber,
                    confirmations,
                    transactionHash: receipt.hash,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            logger.error('Error verifying payment event', {
                error: error instanceof Error ? error.message : 'Unknown error',
                paymentId,
                merchant
            });

            return {
                isValid: false,
                reason: `Event verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Verify transaction has sufficient confirmations
     */
    async verifyTransactionConfirmations(
        transactionHash: string,
        minConfirmations: number = 3
    ): Promise<{
        isValid: boolean;
        confirmations: number;
        reason?: string;
    }> {
        try {
            const receipt = await this.provider.getTransactionReceipt(transactionHash);

            if (!receipt) {
                return {
                    isValid: false,
                    confirmations: 0,
                    reason: 'Transaction not found'
                };
            }

            const currentBlock = await this.provider.getBlockNumber();
            const confirmations = currentBlock - receipt.blockNumber;

            return {
                isValid: confirmations >= minConfirmations,
                confirmations,
                reason: confirmations < minConfirmations
                    ? `Only ${confirmations}/${minConfirmations} confirmations`
                    : undefined
            };

        } catch (error) {
            logger.error('Error verifying confirmations', { error, transactionHash });
            return {
                isValid: false,
                confirmations: 0,
                reason: 'Failed to query transaction'
            };
        }
    }
}

export { EventVerificationService };
export default new EventVerificationService();
