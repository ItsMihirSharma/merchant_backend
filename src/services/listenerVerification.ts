import { ethers } from 'ethers';
import { CHAIN_CONFIG, CONTRACTS, VERIFICATION_THRESHOLDS } from '../config/contracts';
import logger from '../utils/logger';

/**
 * Service to verify listener node registration and status on-chain
 */
class ListenerVerificationService {
    private provider: ethers.JsonRpcProvider;
    private registryContract: ethers.Contract;

    constructor() {
        // Configure provider with timeout and retry settings
        this.provider = new ethers.JsonRpcProvider(
            CHAIN_CONFIG.rpcUrl,
            undefined,
            {
                staticNetwork: true,
                batchMaxCount: 1
            }
        );

        this.registryContract = new ethers.Contract(
            CONTRACTS.LISTENER_REGISTRY.address,
            CONTRACTS.LISTENER_REGISTRY.abi,
            this.provider
        );
    }

    /**
     * Retry logic with exponential backoff for RPC calls
     * Handles transient network failures gracefully
     */
    private async retryWithBackoff<T>(
        fn: () => Promise<T>,
        operation: string,
        maxRetries: number = 3
    ): Promise<T> {
        let lastError: any;
        const baseDelay = 1000; // 1 second

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;

                const isTimeout = error.code === 'TIMEOUT' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'NETWORK_ERROR' ||
                    error.message?.includes('timeout') ||
                    error.message?.includes('network');

                if (attempt < maxRetries && isTimeout) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 5000);

                    logger.debug(`Retrying ${operation} (attempt ${attempt}/${maxRetries})`, {
                        delay: `${delay}ms`,
                        error: error.code || error.message
                    });

                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    break;
                }
            }
        }

        throw lastError;
    }

    /**
     * Verify listener signature on webhook payload
     * Prevents spoofing attacks
     */
    async verifyListenerSignature(
        payload: any,
        signature: string,
        listenerAddress: string
    ): Promise<boolean> {
        try {
            logger.info('Verifying listener signature', { listenerAddress });

            if (!signature || !listenerAddress) {
                logger.warn('Missing signature or listener address');
                return false;
            }

            // Reconstruct the SAME message format that listener signed
            // Must match WebhookSender.signPayload() format exactly
            const message = JSON.stringify({
                type: payload.type,
                payment_id: payload.payment_id,
                merchant: payload.merchant,
                amount: payload.amount,
                timestamp: payload.timestamp,
                chain_id: payload.chain_id,
            });

            // Verify signature using ethers.verifyMessage
            const recoveredAddress = ethers.verifyMessage(message, signature);

            logger.debug('Signature verification', {
                expected: listenerAddress,
                recovered: recoveredAddress
            });

            // Check if recovered address matches claimed listener
            const isValid = recoveredAddress.toLowerCase() === listenerAddress.toLowerCase();

            if (!isValid) {
                logger.warn('Signature mismatch', {
                    expected: listenerAddress,
                    recovered: recoveredAddress
                });
            } else {
                logger.info('✅ Signature verified', { listener: listenerAddress });
            }

            return isValid;
        } catch (error) {
            logger.error('Error verifying listener signature', { error });
            return false;
        }
    }

    /**
     * Check that the listener node is registered in ListenerRegistry.sol
     * Prevents unauthorized nodes from delivering webhooks
     */
    async verifyListenerRegistered(listenerAddress: string): Promise<{
        isValid: boolean;
        reason?: string;
        listenerInfo?: any;
    }> {
        try {
            logger.info('Verifying listener registration', { listenerAddress });

            // Query listener info from registry using getListener function with retry logic
            // Contract returns tuple: (nodeAddress, stake, registeredAt, totalDelivered, successfulDeliveries, failedDeliveries, totalEarned, reputation, active, slashed, lastActivityTime)
            const result = await this.retryWithBackoff(
                () => this.registryContract.getListener(listenerAddress),
                'getListener',
                3 // 3 retries with exponential backoff
            );

            // Access tuple elements by index
            const active = result[8];
            const slashed = result[9];
            const stake = result[1];
            const reputation = result[7];

            logger.debug('Listener info from registry', {
                address: listenerAddress,
                active,
                stake: ethers.formatEther(stake),
                reputation: reputation.toString(),
                slashed
            });

            // Check if listener is active
            if (!active) {
                return {
                    isValid: false,
                    reason: 'Listener is not active'
                };
            }

            // Check if listener has been slashed (banned)
            if (slashed) {
                return {
                    isValid: false,
                    reason: 'Listener has been slashed (banned)'
                };
            }

            // Check stake is sufficient
            const minStake = ethers.parseEther(VERIFICATION_THRESHOLDS.minListenerStake);
            if (stake < minStake) {
                return {
                    isValid: false,
                    reason: `Listener stake too low: ${ethers.formatEther(stake)} ETH (minimum: ${VERIFICATION_THRESHOLDS.minListenerStake} ETH)`
                };
            }

            // Check reputation threshold
            if (Number(reputation) < VERIFICATION_THRESHOLDS.minListenerReputation) {
                return {
                    isValid: false,
                    reason: `Listener reputation too low: ${reputation} (minimum: ${VERIFICATION_THRESHOLDS.minListenerReputation})`
                };
            }

            logger.info('Listener verification passed', {
                address: listenerAddress,
                stake: ethers.formatEther(stake),
                reputation: reputation.toString()
            });

            return {
                isValid: true,
                listenerInfo: {
                    address: listenerAddress,
                    stake: ethers.formatEther(stake),
                    reputation: reputation.toString(),
                    active,
                    slashed
                }
            };
        } catch (error) {
            logger.error('Error verifying listener registration after retries', {
                error: error instanceof Error ? error.message : 'Unknown error',
                listenerAddress
            });

            // Check if we should allow during RPC failures (graceful degradation)
            const allowDuringRpcFailure = process.env.ALLOW_DURING_RPC_FAILURE === 'true';

            if (allowDuringRpcFailure) {
                logger.warn('⚠️  Allowing webhook despite RPC failure (degraded mode)', {
                    listenerAddress,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });

                return {
                    isValid: true,
                    reason: 'Verification skipped due to RPC failure (degraded mode)',
                    listenerInfo: {
                        address: listenerAddress,
                        degraded: true
                    }
                };
            }

            // If ListenerRegistry is not available or has errors, return invalid
            // This ensures security by default - only allow if verification succeeds
            return {
                isValid: false,
                reason: `Blockchain query failed after ${3} retries: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Get detailed listener statistics
     */
    async getListenerStats(listenerAddress: string) {
        try {
            const result = await this.retryWithBackoff(
                () => this.registryContract.getListener(listenerAddress),
                'getListener',
                3
            );

            // Access tuple elements by index
            const nodeAddress = result[0];
            const stake = result[1];
            const registeredAt = result[2];
            const totalDelivered = result[3];
            const successfulDeliveries = result[4];
            const failedDeliveries = result[5];
            const totalEarned = result[6];
            const reputation = result[7];
            const active = result[8];
            const slashed = result[9];

            return {
                address: listenerAddress,
                active,
                slashed,
                stake: ethers.formatEther(stake),
                reputation: reputation.toString(),
                registeredAt: new Date(Number(registeredAt) * 1000).toISOString(),
                totalDelivered: totalDelivered.toString(),
                successfulDeliveries: successfulDeliveries.toString(),
                failedDeliveries: failedDeliveries.toString(),
                totalEarned: ethers.formatEther(totalEarned),
                successRate: totalDelivered > 0n
                    ? ((Number(successfulDeliveries) / Number(totalDelivered)) * 100).toFixed(2) + '%'
                    : '0%'
            };
        } catch (error) {
            logger.error('Error fetching listener stats', { error, listenerAddress });
            throw error;
        }
    }
}

export { ListenerVerificationService };
export default new ListenerVerificationService();
