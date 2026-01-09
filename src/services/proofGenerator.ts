import { ethers } from 'ethers';
import { VERIFICATION_THRESHOLDS } from '../config/contracts';
import logger from '../utils/logger';

/**
 * Core proof generation service with EIP-712 signatures
 */
export class ProofGeneratorService {
    private merchantWallet: ethers.Wallet;

    constructor() {
        const privateKey = process.env.MERCHANT_PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('MERCHANT_PRIVATE_KEY not configured');
        }
        this.merchantWallet = new ethers.Wallet(privateKey);
        logger.info('Proof generator initialized', {
            merchantAddress: this.merchantWallet.address
        });
    }

    /**
     * Generate cryptographic proof that merchant received webhook
     * This proof allows listener to claim rewards on-chain
     */
    async generateMerchantProof(params: {
        payment_id: string;
        listener_address: string;
        timestamp: number;
        webhook_received: boolean;
        order_id?: string;
        amount?: string;
    }): Promise<{
        signature: string;
        message: string;
        timestamp: number;
        method: string;
    }> {
        try {
            logger.info('Generating merchant proof', {
                paymentId: params.payment_id,
                listener: params.listener_address
            });

            // Validate inputs
            this.validateProofParams(params);

            // Create the message to sign
            // IMPORTANT: This must match exactly what the smart contract expects
            const message = ethers.solidityPackedKeccak256(
                ['bytes32', 'address'],
                [params.payment_id, params.listener_address]
            );

            logger.debug('Message to sign', { message });

            // Sign the message with merchant's private key
            const signature = await this.merchantWallet.signMessage(ethers.getBytes(message));

            logger.info('Merchant proof generated', {
                paymentId: params.payment_id,
                signature: signature.substring(0, 10) + '...'
            });

            return {
                message,
                signature,
                timestamp: params.timestamp,
                method: 'simple'
            };

        } catch (error) {
            logger.error('Error generating merchant proof', { error, params });
            throw error;
        }
    }

    /**
     * Generate EIP-712 typed signature (More Secure & Structured)
     * Recommended for production
     */
    async generateEIP712Signature(params: {
        payment_id: string;
        listener_address: string;
        timestamp: number;
        webhook_received: boolean;
        order_id: string;
        amount: string;
    }): Promise<{
        signature: string;
        domain: any;
        types: any;
        value: any;
        timestamp: number;
        method: string;
    }> {
        try {
            logger.info('Generating EIP-712 proof', {
                paymentId: params.payment_id,
                listener: params.listener_address
            });

            // Define EIP-712 domain
            const domain = {
                name: 'Web3Pay Merchant Confirmation',
                version: '1',
                chainId: 11155111, // Sepolia
                verifyingContract: process.env.LISTENER_REGISTRY_ADDRESS || ethers.ZeroAddress
            };

            // Define message types
            const types = {
                WebhookConfirmation: [
                    { name: 'paymentId', type: 'bytes32' },
                    { name: 'listener', type: 'address' },
                    { name: 'merchant', type: 'address' },
                    { name: 'amount', type: 'uint256' },
                    { name: 'orderId', type: 'bytes32' },
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'received', type: 'bool' }
                ]
            };

            // Define message value
            const value = {
                paymentId: params.payment_id,
                listener: params.listener_address,
                merchant: this.merchantWallet.address,
                amount: ethers.parseEther(params.amount.toString()),
                orderId: ethers.id(params.order_id),
                timestamp: params.timestamp,
                received: params.webhook_received
            };

            // Sign typed data
            const signature = await this.merchantWallet.signTypedData(domain, types, value);

            logger.info('EIP-712 proof generated', {
                paymentId: params.payment_id,
                signature: signature.substring(0, 10) + '...'
            });

            return {
                domain,
                types,
                value,
                signature,
                timestamp: params.timestamp,
                method: 'eip712'
            };

        } catch (error) {
            logger.error('Error generating EIP-712 proof', { error, params });
            throw error;
        }
    }

    /**
     * Validate proof generation parameters
     */
    private validateProofParams(params: any): void {
        if (!params.payment_id) {
            throw new Error('payment_id is required');
        }

        if (!params.listener_address || !ethers.isAddress(params.listener_address)) {
            throw new Error('Valid listener_address is required');
        }

        if (!params.timestamp || params.timestamp <= 0) {
            throw new Error('Valid timestamp is required');
        }

        // Check timestamp is not too old
        const now = Date.now();
        const age = now - params.timestamp;
        const maxAge = VERIFICATION_THRESHOLDS.proofExpirySeconds * 1000;

        if (age > maxAge) {
            throw new Error(`Timestamp too old: ${Math.floor(age / 1000)}s (max: ${VERIFICATION_THRESHOLDS.proofExpirySeconds}s)`);
        }

        // Check timestamp is not in the future
        if (params.timestamp > now + 60000) { // Allow 1 minute clock skew
            throw new Error('Timestamp is in the future');
        }
    }

    /**
     * Verify a proof signature (for testing)
     */
    async verifyProof(
        message: string,
        signature: string,
        expectedSigner: string
    ): Promise<boolean> {
        try {
            const recoveredAddress = ethers.recoverAddress(
                ethers.hashMessage(ethers.getBytes(message)),
                signature
            );

            return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
        } catch (error) {
            logger.error('Error verifying proof', { error });
            return false;
        }
    }

    /**
     * Get merchant address
     */
    getMerchantAddress(): string {
        return this.merchantWallet.address;
    }
}

export default new ProofGeneratorService();
