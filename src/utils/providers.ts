import { ethers } from 'ethers';

export const RPC_PROVIDERS = {
    ethereum: new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC),
    polygon: new ethers.JsonRpcProvider(process.env.POLYGON_RPC),
    arbitrum: new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC),
    base: new ethers.JsonRpcProvider(process.env.BASE_RPC)
};

export function getProviderForChain(chain: string): ethers.JsonRpcProvider {
    const provider = RPC_PROVIDERS[chain.toLowerCase() as keyof typeof RPC_PROVIDERS];
    if (!provider) {
        throw new Error(`Unsupported chain: ${chain}`);
    }
    return provider;
}

export const PAYMENT_CONTRACT_ADDRESS = process.env.PAYMENT_CONTRACT_ADDRESS || '0x5a5CB666eD776efAFcF05862353285Fb05f28465';

// PaymentRouter ABI - hardcoded to avoid env variable JSON issues
export const PAYMENT_CONTRACT_ABI = [
    'event PaymentCompleted(bytes32 indexed paymentId, address indexed merchant, address indexed customer, uint256 amount, uint256 platformFee, uint256 listenerFee, uint256 merchantAmount)',
    'function createPayment(address merchant, bytes32 paymentId, bytes32 externalRef, uint256 deadline, bytes calldata signature) external payable returns (bytes32)',
    'function getPayment(bytes32 paymentId) external view returns (tuple(address customer, address merchant, uint256 amount, uint256 platformFee, uint256 listenerFee, uint256 merchantAmount, bytes32 externalRef, uint8 status, uint256 createdAt, uint256 completedAt))',
];
