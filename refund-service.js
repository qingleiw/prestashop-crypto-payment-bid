const crypto = require('crypto');

// Non-Custodial Refund Service
// Handles BO-initiated deep links where operators sign in Trust Wallet
class RefundService {
    constructor(db) {
        this.db = db;
        this.deepLinkPrefix = 'cryptopay://refund/';
        this.supportedChains = ['ETH', 'BSC'];
        this.maxRefundAmount = 100; // Max refund amount in native currency
    }

    // Generate refund deep link for operator to sign in Trust Wallet
    async generateRefundLink(orderId, refundAmount, refundReason = '') {
        try {
            console.log(`RefundService: Generating refund link for order ${orderId}`);

            // Get order and transaction details
            const orderData = await this.getOrderData(orderId);
            if (!orderData) {
                throw new Error('Order not found');
            }

            // Validate refund amount
            if (refundAmount > this.maxRefundAmount) {
                throw new Error(`Refund amount exceeds maximum limit of ${this.maxRefundAmount}`);
            }

            // Check if refund is possible
            const refundCheck = await this.validateRefund(orderData, refundAmount);
            if (!refundCheck.valid) {
                throw new Error(refundCheck.error);
            }

            // Generate refund request
            const refundRequest = {
                id: this.generateRefundId(),
                orderId: orderId,
                amount: refundAmount,
                chain: orderData.chain,
                asset: orderData.asset,
                recipient: orderData.customerAddress,
                reason: refundReason,
                timestamp: Math.floor(Date.now() / 1000),
                expires: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
            };

            // Create deep link
            const deepLink = this.createDeepLink(refundRequest);

            // Store refund request in database
            await this.storeRefundRequest(refundRequest);

            return {
                deepLink,
                refundRequest,
                qrCode: this.generateQRCode(deepLink)
            };

        } catch (error) {
            console.error('RefundService: Failed to generate refund link:', error);
            throw error;
        }
    }

    // Process signed refund transaction from Trust Wallet
    async processSignedRefund(refundId, signedTx, signature) {
        try {
            console.log(`RefundService: Processing signed refund ${refundId}`);

            // Get refund request
            const refundRequest = await this.getRefundRequest(refundId);
            if (!refundRequest) {
                throw new Error('Refund request not found');
            }

            // Validate signature
            const isValidSignature = await this.validateOperatorSignature(refundRequest, signature);
            if (!isValidSignature) {
                throw new Error('Invalid operator signature');
            }

            // Validate transaction
            const txValidation = await this.validateRefundTransaction(signedTx, refundRequest);
            if (!txValidation.valid) {
                throw new Error(txValidation.error);
            }

            // Broadcast transaction
            const txHash = await this.broadcastTransaction(signedTx, refundRequest.chain);

            // Update refund status
            await this.updateRefundStatus(refundId, 'broadcasted', txHash);

            // Start monitoring transaction
            await this.startRefundMonitoring(txHash, refundRequest);

            return {
                success: true,
                txHash,
                refundId
            };

        } catch (error) {
            console.error('RefundService: Failed to process signed refund:', error);
            await this.updateRefundStatus(refundId, 'failed', null, error.message);
            throw error;
        }
    }

    // Get order data for refund
    async getOrderData(orderId) {
        try {
            const [rows] = await this.db.execute(`
                SELECT
                    o.id, o.total_paid_real, o.id_currency,
                    addr.chain, addr.asset, addr.address as customer_address,
                    tx.tx_hash, tx.amount_asset, tx.created_at as payment_date
                FROM ps_orders o
                LEFT JOIN ps_crypto_order_addr addr ON o.id = addr.order_id
                LEFT JOIN ps_crypto_tx tx ON o.id = tx.order_id AND tx.type = 'payment'
                WHERE o.id = ?
                ORDER BY tx.created_at DESC
                LIMIT 1
            `, [orderId]);

            return rows[0] || null;

        } catch (error) {
            console.error('RefundService: Failed to get order data:', error);
            throw error;
        }
    }

    // Validate if refund is possible
    async validateRefund(orderData, refundAmount) {
        try {
            // Check if order exists and was paid
            if (!orderData || !orderData.tx_hash) {
                return { valid: false, error: 'Order not found or not paid' };
            }

            // Check refund amount vs payment amount
            const paymentAmount = parseFloat(orderData.amount_asset);
            if (refundAmount > paymentAmount * 1.1) { // Allow 10% buffer
                return { valid: false, error: 'Refund amount exceeds payment amount' };
            }

            // Check if already refunded
            const existingRefund = await this.checkExistingRefund(orderData.id);
            if (existingRefund) {
                return { valid: false, error: 'Refund already exists for this order' };
            }

            // Check time limit (e.g., 30 days)
            const paymentDate = new Date(orderData.payment_date);
            const daysSincePayment = (Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSincePayment > 30) {
                return { valid: false, error: 'Refund period expired' };
            }

            return { valid: true };

        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    // Check if refund already exists
    async checkExistingRefund(orderId) {
        try {
            const [rows] = await this.db.execute(
                'SELECT id FROM ps_crypto_tx WHERE order_id = ? AND type = ?',
                [orderId, 'refund']
            );
            return rows.length > 0;
        } catch (error) {
            console.error('RefundService: Failed to check existing refund:', error);
            return false;
        }
    }

    // Generate unique refund ID
    generateRefundId() {
        return 'refund_' + crypto.randomBytes(16).toString('hex');
    }

    // Create deep link for Trust Wallet
    createDeepLink(refundRequest) {
        const payload = Buffer.from(JSON.stringify(refundRequest)).toString('base64');
        return `${this.deepLinkPrefix}${payload}`;
    }

    // Generate QR code data URL (simplified)
    generateQRCode(deepLink) {
        // In production, use a QR code library
        return `data:image/png;base64,${Buffer.from(deepLink).toString('base64')}`;
    }

    // Store refund request
    async storeRefundRequest(refundRequest) {
        try {
            await this.db.execute(`
                INSERT INTO ps_crypto_refund_requests
                (id, order_id, amount, chain, asset, recipient, reason, status, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), FROM_UNIXTIME(?))
            `, [
                refundRequest.id,
                refundRequest.orderId,
                refundRequest.amount,
                refundRequest.chain,
                refundRequest.asset,
                refundRequest.recipient,
                refundRequest.reason,
                refundRequest.expires
            ]);
        } catch (error) {
            console.error('RefundService: Failed to store refund request:', error);
            throw error;
        }
    }

    // Get refund request
    async getRefundRequest(refundId) {
        try {
            const [rows] = await this.db.execute(
                'SELECT * FROM ps_crypto_refund_requests WHERE id = ?',
                [refundId]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('RefundService: Failed to get refund request:', error);
            throw error;
        }
    }

    // Validate operator signature
    async validateOperatorSignature(refundRequest, signature) {
        try {
            // In production, verify against known operator public keys
            // For demo, we'll do basic validation
            return signature && signature.length > 64;
        } catch (error) {
            console.error('RefundService: Signature validation failed:', error);
            return false;
        }
    }

    // Validate refund transaction
    async validateRefundTransaction(signedTx, refundRequest) {
        try {
            // Basic validation - check amount, recipient, etc.
            if (!signedTx || !signedTx.to || !signedTx.value) {
                return { valid: false, error: 'Invalid transaction format' };
            }

            // Check recipient matches customer address
            if (signedTx.to.toLowerCase() !== refundRequest.recipient.toLowerCase()) {
                return { valid: false, error: 'Transaction recipient mismatch' };
            }

            // Check amount (with some tolerance for gas)
            const txAmount = parseFloat(signedTx.value) / 1e18;
            if (Math.abs(txAmount - refundRequest.amount) > 0.01) {
                return { valid: false, error: 'Transaction amount mismatch' };
            }

            return { valid: true };

        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    // Broadcast transaction (mock implementation)
    async broadcastTransaction(signedTx, chain) {
        try {
            console.log(`RefundService: Broadcasting transaction on ${chain}`);

            // In production, broadcast to actual blockchain
            // For demo, return mock tx hash
            const txHash = '0x' + crypto.randomBytes(32).toString('hex');

            console.log(`RefundService: Transaction broadcasted: ${txHash}`);
            return txHash;

        } catch (error) {
            console.error('RefundService: Failed to broadcast transaction:', error);
            throw error;
        }
    }

    // Update refund status
    async updateRefundStatus(refundId, status, txHash = null, error = null) {
        try {
            await this.db.execute(`
                UPDATE ps_crypto_refund_requests
                SET status = ?, tx_hash = ?, error_message = ?, updated_at = NOW()
                WHERE id = ?
            `, [status, txHash, error, refundId]);

            // Also create transaction record if completed
            if (status === 'broadcasted' && txHash) {
                const refundRequest = await this.getRefundRequest(refundId);
                await this.db.execute(`
                    INSERT INTO ps_crypto_tx
                    (order_id, type, tx_hash, amount_asset, meta_json)
                    VALUES (?, 'refund', ?, ?, ?)
                `, [
                    refundRequest.order_id,
                    txHash,
                    refundRequest.amount,
                    JSON.stringify({
                        refund_id: refundId,
                        reason: refundRequest.reason
                    })
                ]);
            }

        } catch (error) {
            console.error('RefundService: Failed to update refund status:', error);
            throw error;
        }
    }

    // Start monitoring refund transaction
    async startRefundMonitoring(txHash, refundRequest) {
        try {
            // In production, integrate with watcher service
            console.log(`RefundService: Started monitoring refund transaction ${txHash}`);

            // For demo, just log
            // watcherService.watchRefund(txHash, refundRequest);

        } catch (error) {
            console.error('RefundService: Failed to start refund monitoring:', error);
        }
    }

    // Get refund status
    async getRefundStatus(refundId) {
        try {
            const refundRequest = await this.getRefundRequest(refundId);
            if (!refundRequest) {
                return { error: 'Refund request not found' };
            }

            return {
                id: refundRequest.id,
                orderId: refundRequest.order_id,
                amount: refundRequest.amount,
                status: refundRequest.status,
                txHash: refundRequest.tx_hash,
                createdAt: refundRequest.created_at,
                error: refundRequest.error_message
            };

        } catch (error) {
            console.error('RefundService: Failed to get refund status:', error);
            throw error;
        }
    }

    // List pending refunds for operator
    async getPendingRefunds() {
        try {
            const [rows] = await this.db.execute(`
                SELECT * FROM ps_crypto_refund_requests
                WHERE status = 'pending' AND expires_at > NOW()
                ORDER BY created_at DESC
            `);

            return rows.map(row => ({
                id: row.id,
                orderId: row.order_id,
                amount: row.amount,
                chain: row.chain,
                asset: row.asset,
                recipient: row.recipient,
                reason: row.reason,
                createdAt: row.created_at,
                expiresAt: row.expires_at
            }));

        } catch (error) {
            console.error('RefundService: Failed to get pending refunds:', error);
            throw error;
        }
    }
}

module.exports = RefundService;