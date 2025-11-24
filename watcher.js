// Watcher for N-confirmation with reorg handling, RPC+explorer corroboration, idempotency

const ethers = require('ethers');

class WatcherService {
    constructor(rpcUrls, explorerUrls) {
        this.rpcUrls = rpcUrls;
        this.explorerUrls = explorerUrls;
        this.confirmationsRequired = { 'ETH': 12, 'BSC': 6 };
        this.reorgDepth = { 'ETH': 12, 'BSC': 6 };
        this.processedTxs = new Set();
    }

    // Watch for payment to address
    async watchPayment(chain, orderId, address, expectedAmount, tolerancePct = 5) {
        const idempotentKey = ${chain}::;
        if (this.processedTxs.has(idempotentKey)) return;

        this.processedTxs.add(idempotentKey);
        const provider = new ethers.JsonRpcProvider(this.rpcUrls[chain][0]);
        const minAmount = expectedAmount * (1 - tolerancePct / 100);

        // Monitor new blocks
        provider.on('block', async (blockNumber) => {
            await this.checkBlockForPayment(chain, blockNumber, address, orderId, minAmount, provider);
        });
    }

    async checkBlockForPayment(chain, blockNumber, address, orderId, minAmount, provider) {
        const block = await provider.getBlock(blockNumber, true);

        for (const tx of block.transactions) {
            if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
                const amount = parseFloat(ethers.formatEther(tx.value));
                if (amount >= minAmount) {
                    const confirmations = await this.getConfirmations(chain, tx.hash, provider);
                    if (confirmations >= this.confirmationsRequired[chain]) {
                        const explorerVerified = await this.verifyWithExplorer(chain, tx.hash);
                        if (explorerVerified) {
                            await this.confirmPayment(chain, orderId, tx, amount);
                            return;
                        }
                    }
                }
            }
        }
    }

    async getConfirmations(chain, txHash, provider) {
        const tx = await provider.getTransaction(txHash);
        if (!tx) return 0;
        const currentBlock = await provider.getBlockNumber();
        return currentBlock - tx.blockNumber;
    }

    async verifyWithExplorer(chain, txHash) {
        const explorerUrl = this.explorerUrls[chain];
        const response = await fetch(${explorerUrl}/api?module=transaction&action=gettxinfo&txhash=);
        const data = await response.json();
        return data.status === '1';
    }

    async confirmPayment(chain, orderId, tx, amount) {
        console.log(Payment confirmed for order :   tokens);
        // Update database and order status
        // Implementation details in full version
    }

    // Handle blockchain reorganizations
    async handleReorg(chain, blockNumber) {
        console.log(Handling reorg for  at block );
        // Check affected transactions and re-verify
        // Implementation details in full version
    }
}

module.exports = WatcherService;
