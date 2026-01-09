import { ethers } from 'ethers';
import { CHAIN_CONFIG, CONTRACTS, VERIFICATION_THRESHOLDS } from '../config/contracts';
import logger from '../utils/logger';

/**
 * Service to verify payment exists on blockchain
 */
class BlockchainVerificationService {
    private provider: ethers.JsonRpcProvider;
    private paymentDbContract: ethers.Contract;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
        this.paymentDbContract = new ethers.Contract(
            CONTRACTS.PAYMENT_DATABASE.address,
            CONTRACTS.PAYMENT_DATABASE.abi,
            this.provider
        );
    }

    /**
     * Verify that the payment actually exists on the blockchain
     * Critical: Prevents listener from claiming rewards for fake payments
     */
    async verifyPaymentOnChain(
        paymentId: string,
        merchant: string,
        customer: string,
        amount: string
    ): Promise<{
        isValid: boolean;
        reason?: string;
        paymentData?: any;
    }> {
        try {
            logger.info('Verifying payment on blockchain', { paymentId, merchant });

            // Check if payment verification is disabled via environment variable
            const skipVerification = process.env.SKIP_PAYMENT_VERIFICATION === 'true';

            if (skipVerification) {
                logger.warn('⚠️  Payment verification skipped (SKIP_PAYMENT_VERIFICATION=true)');

                return {
                    isValid: true,
                    paymentData: {
                        paymentId,
                        merchant,
                        customer,
                        amount,
                        amountWei: ethers.parseEther(amount).toString(),
                        timestamp: new Date().toISOString(),
                        status: 'COMPLETED'
                    }
                };
            }

            // If not skipping verification, PaymentDatabase verification would go here
            // For now, if SKIP_PAYMENT_VERIFICATION is not set, fail with clear message
            logger.error('Payment verification enabled but PaymentDatabase not configured');
            return {
                isValid: false,
                reason: 'Payment verification enabled but PaymentDatabase not available. Set SKIP_PAYMENT_VERIFICATION=true for testnet.'
            };

            /* DISABLED - PaymentDatabase removed from architecture
            // Query PaymentDatabase contract
            const paymentData = await this.paymentDbContract.getPayment(paymentId);

            logger.debug('Blockchain payment data', {
                paymentId: paymentData.paymentId,
                merchant: paymentData.merchant,
                customer: paymentData.customer,
                amount: ethers.formatEther(paymentData.amount),
                status: paymentData.status
            });

            // Verify payment exists
            if (paymentData.paymentId === ethers.ZeroHash) {
                return {
                    isValid: false,
                    reason: 'Payment not found in blockchain database'
                };
            }

            // Verify merchant matches
            if (paymentData.merchant.toLowerCase() !== merchant.toLowerCase()) {
                return {
                    isValid: false,
                    reason: `Merchant address mismatch. Expected: ${merchant}, Got: ${paymentData.merchant}`
                };
            }

            // Verify customer matches
            if (paymentData.customer.toLowerCase() !== customer.toLowerCase()) {
                return {
                    isValid: false,
                    reason: `Customer address mismatch. Expected: ${customer}, Got: ${paymentData.customer}`
                };
            }

            // Verify status is COMPLETED (status = 1)
            if (paymentData.status !== 1) {
                const statusNames = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
                return {
                    isValid: false,
                    reason: `Payment status is ${statusNames[paymentData.status] || 'UNKNOWN'}, not COMPLETED`
                };
            }

            logger.info('Payment verification passed', {
                paymentId,
                merchant: paymentData.merchant,
                amount: ethers.formatEther(paymentData.amount)
            });

            return {
                isValid: true,
                paymentData: {
                    paymentId: paymentData.paymentId,
                    merchant: paymentData.merchant,
                    customer: paymentData.customer,
                    amount: ethers.formatEther(paymentData.amount),
                    amountWei: paymentData.amount.toString(),
                    timestamp: new Date(Number(paymentData.timestamp) * 1000).toISOString(),
                    status: 'COMPLETED',
                    orderId: paymentData.orderId,
                    nonce: paymentData.nonce.toString()
                }
            }
            */;
        } catch (error) {
            logger.error('Error verifying payment on blockchain', { error, paymentId });
            return {
                isValid: false,
                reason: `Blockchain query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Verify transaction exists and has sufficient confirmations
     */
    async verifyTransactionReceipt(txHash: string): Promise<{
        isValid: boolean;
        reason?: string;
        confirmations?: number;
        blockNumber?: number;
    }> {
        try {
            logger.info('Verifying transaction receipt', { txHash });

            const receipt = await this.provider.getTransactionReceipt(txHash);

            if (!receipt) {
                return {
                    isValid: false,
                    reason: 'Transaction not found on blockchain'
                };
            }

            if (receipt.status !== 1) {
                return {
                    isValid: false,
                    reason: 'Transaction failed (status 0)'
                };
            }

            const currentBlock = await this.provider.getBlockNumber();
            const confirmations = currentBlock - receipt.blockNumber;

            logger.debug('Transaction receipt', {
                txHash,
                blockNumber: receipt.blockNumber,
                confirmations,
                status: receipt.status
            });

            if (confirmations < VERIFICATION_THRESHOLDS.minConfirmations) {
                return {
                    isValid: false,
                    reason: `Insufficient confirmations: ${confirmations} (minimum: ${VERIFICATION_THRESHOLDS.minConfirmations})`,
                    confirmations,
                    blockNumber: receipt.blockNumber
                };
            }

            return {
                isValid: true,
                confirmations,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            logger.error('Error verifying transaction receipt', { error, txHash });
            return {
                isValid: false,
                reason: `Transaction query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Get current payment status from blockchain
     */
    async getPaymentStatus(paymentId: string): Promise<string> {
        try {
            const paymentData = await this.paymentDbContract.getPayment(paymentId);
            const statusNames = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
            return statusNames[paymentData.status] || 'UNKNOWN';
        } catch (error) {
            logger.error('Error getting payment status', { error, paymentId });
            return 'ERROR';
        }
    }
}

export { BlockchainVerificationService };
export default new BlockchainVerificationService();
