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

export const PAYMENT_CONTRACT_ADDRESS = process.env.PAYMENT_CONTRACT_ADDRESS!;
export const PAYMENT_CONTRACT_ABI = JSON.parse(process.env.PAYMENT_CONTRACT_ABI || '[]');
