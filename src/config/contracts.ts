// Contract addresses and ABIs for blockchain verification
import { config } from 'dotenv';

config();

export const CONTRACTS = {
    LISTENER_REGISTRY: {
        address: process.env.LISTENER_REGISTRY_ADDRESS || '0xC5ea445f72537770ad7A6895879157f7eA9fb065',
        abi: [
            'function getListener(address) view returns (address nodeAddress, uint256 stake, uint256 registeredAt, uint256 totalDelivered, uint256 successfulDeliveries, uint256 failedDeliveries, uint256 totalEarned, uint256 reputation, bool active, bool slashed, uint256 lastActivityTime)',
            'function MIN_STAKE() view returns (uint256)'
        ]
    },

    PAYMENT_DATABASE: {
        address: process.env.PAYMENT_DATABASE_ADDRESS || '0x1074c816F94bfB28f07B38E6372a87F7bD6ce365',
        abi: [
            'function getPayment(bytes32) view returns (bytes32 paymentId, address merchant, address customer, uint256 amount, uint256 timestamp, uint8 paymentType, uint8 status, bytes32 orderId, uint256 nonce)'
        ]
    },

    CONFIG_STORE: {
        address: process.env.CONFIG_STORE_ADDRESS || '0xa00453A4B28156948B7187195421d8080DF6F191',
        abi: [
            'function isMerchantRegistered(address merchant) view returns (bool)',
            'function getMerchantInfo(address merchant) view returns (uint256 registeredAt, uint256 stake, bool isActive)',
            'function getMerchantWebhookUrl(address merchant) view returns (string)'
        ]
    }
};

export const CHAIN_CONFIG = {
    rpcUrl: process.env.ETHEREUM_RPC || 'https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY',
    chainId: parseInt(process.env.CHAIN_ID || '11155111')
};

export const VERIFICATION_THRESHOLDS = {
    minListenerStake: process.env.MIN_LISTENER_STAKE || '0.01', // ETH
    minListenerReputation: parseInt(process.env.MIN_LISTENER_REPUTATION || '30'),
    minConfirmations: parseInt(process.env.MIN_CONFIRMATIONS || '3'),
    proofExpirySeconds: parseInt(process.env.PROOF_EXPIRY_SECONDS || '3600')
};
