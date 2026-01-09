import { ethers } from 'ethers';
import { getProviderForChain, PAYMENT_CONTRACT_ADDRESS, PAYMENT_CONTRACT_ABI } from '../utils/providers';

export async function verifyTransactionOnChain(
    txHash: string,
    expectedAmount: string,
    expectedMerchant: string,
    chain: string
): Promise<boolean> {
    try {
        const provider = getProviderForChain(chain);
        const receipt = await provider.getTransactionReceipt(txHash);

        if (!receipt || receipt.status !== 1) {
            return false; // Transaction failed or not found
        }

        // Verify contract address
        if (receipt.to?.toLowerCase() !== PAYMENT_CONTRACT_ADDRESS.toLowerCase()) {
            return false;
        }

        // Parse event logs
        const iface = new ethers.Interface(PAYMENT_CONTRACT_ABI);
        const paymentEvent = receipt.logs
            .map(log => {
                try {
                    return iface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .find(log => log?.name === 'PaymentCompleted');

        if (!paymentEvent) {
            return false;
        }

        // Verify parameters
        const { merchant, amount } = paymentEvent.args;

        return (
            merchant.toLowerCase() === expectedMerchant.toLowerCase() &&
            BigInt(amount) >= BigInt(expectedAmount)
        );
    } catch (error) {
        console.error('Error verifying transaction:', error);
        return false;
    }
}

export async function getTransactionConfirmations(
    txHash: string,
    chain: string
): Promise<number> {
    const provider = getProviderForChain(chain);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return 0;

    const currentBlock = await provider.getBlockNumber();
    return currentBlock - receipt.blockNumber;
}

export async function getTransactionDetails(txHash: string, chain: string) {
    const provider = getProviderForChain(chain);
    const [tx, receipt] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash)
    ]);

    return { tx, receipt };
}
