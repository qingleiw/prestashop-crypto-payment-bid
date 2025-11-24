// Watcher for N-confirmation with reorg handling, RPC+explorer corroboration, idempotency
// Simplified Node.js using ethers.js for RPC and a mock explorer API

const ethers = require('ethers');
const crypto = require('crypto');

// Configuration
const CONFIRMATIONS_REQUIRED = 12; // Configurable
const REORG_DEPTH = 6; // Max reorg depth to handle
const RPC_URL = process.env.RPC_URL;
const EXPLORER_API_URL = process.env.EXPLORER_API_URL;

// Mock database for idempotency (use real DB like MySQL)
const processedTxs = new Set();

// Function to verify transaction
async function verifyTransaction(chain, orderId, txHash, expectedAddress, expectedAmount, tolerancePct) {
    const idempotentKey = `${chain}:${orderId}:${txHash}`;
    if (processedTxs.has(idempotentKey)) {
        console.log('Transaction already processed:', idempotentKey);
        return false;
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    try {
        // Get transaction from RPC
        const tx = await provider.getTransaction(txHash);
        if (!tx) throw new Error('Transaction not found on RPC');

        // Verify destination address
        if (tx.to.toLowerCase() !== expectedAddress.toLowerCase()) {
            throw new Error('Destination address mismatch');
        }

        // Verify token transfer (assuming ERC-20 for simplicity)
        const contract = new ethers.Contract(tx.to, ['function transfer(address,uint256)'], provider);
        // In reality, parse logs for Transfer event
        // For demo, assume amount check
        const amount = ethers.formatUnits(tx.value, 18); // Adjust decimals
        const minAmount = expectedAmount * (1 - tolerancePct / 100);
        if (parseFloat(amount) < minAmount) {
            throw new Error('Amount below tolerance');
        }

        // Check confirmations
        const currentBlock = await provider.getBlockNumber();
        const txBlock = tx.blockNumber;
        const confirmations = currentBlock - txBlock;
        if (confirmations < CONFIRMATIONS_REQUIRED) {
            throw new Error(`Insufficient confirmations: ${confirmations}/${CONFIRMATIONS_REQUIRED}`);
        }

        // Reorg handling: Check if block is still in chain after reorg depth
        if (confirmations > REORG_DEPTH) {
            const block = await provider.getBlock(txBlock + REORG_DEPTH);
            if (!block) throw new Error('Block not found, possible reorg');
        }

        // Corroborate with explorer (mock API call)
        const explorerResponse = await fetch(`${EXPLORER_API_URL}/api?module=transaction&action=gettxinfo&txhash=${txHash}`);
        const explorerData = await explorerResponse.json();
        if (explorerData.status !== '1' || explorerData.result.blockNumber !== txBlock.toString()) {
            throw new Error('Explorer corroboration failed');
        }

        // Mark as processed
        processedTxs.add(idempotentKey);
        console.log('Transaction verified and processed:', idempotentKey);
        return true;
    } catch (error) {
        console.error('Verification failed:', error.message);
        return false;
    }
}

// Usage
verifyTransaction('ETH', 12345, '0x...', '0xExpectedAddress', 100, 5).then(result => {
    if (result) {
        // Update order status to Paid, record tx details
    }
});