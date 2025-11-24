const fs = require('fs').promises;
const path = require('path');

// MiCA/CSV Compliance Export Service
class MiCAComplianceService {
    constructor(db) {
        this.db = db;
        this.exportPath = process.env.MICA_EXPORT_PATH || './exports';
        this.retentionMonths = 12; // MiCA requirement: 12 months rolling data
    }

    // Generate MiCA compliance CSV export
    async generateMiCAExport(startDate = null, endDate = null) {
        try {
            console.log('MiCAComplianceService: Generating MiCA export');

            // Default to last 12 months if no dates provided
            if (!startDate || !endDate) {
                const now = new Date();
                endDate = now.toISOString().split('T')[0];
                startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString().split('T')[0];
            }

            console.log(`MiCAComplianceService: Exporting data from ${startDate} to ${endDate}`);

            // Get transaction data for the period
            const transactions = await this.getTransactionData(startDate, endDate);

            // Generate CSV content
            const csvContent = this.generateCSVContent(transactions);

            // Save to file
            const filename = `mica_compliance_${startDate}_to_${endDate}.csv`;
            const filepath = path.join(this.exportPath, filename);

            // Ensure export directory exists
            await fs.mkdir(this.exportPath, { recursive: true });

            await fs.writeFile(filepath, csvContent, 'utf8');

            console.log(`MiCAComplianceService: Export saved to ${filepath}`);

            return {
                filename,
                filepath,
                recordCount: transactions.length,
                startDate,
                endDate
            };

        } catch (error) {
            console.error('MiCAComplianceService: Export generation failed:', error);
            throw error;
        }
    }

    // Get transaction data for compliance reporting
    async getTransactionData(startDate, endDate) {
        try {
            const query = `
                SELECT
                    t.id,
                    t.order_id,
                    t.type,
                    t.tx_hash,
                    t.block_height,
                    t.block_time,
                    t.amount_asset,
                    t.amount_eur,
                    t.price_source,
                    t.created_at,
                    t.meta_json,
                    o.total_paid_real,
                    o.id_currency,
                    o.date_add as order_date,
                    c.iso_code as currency_code,
                    addr.chain,
                    addr.asset,
                    addr.address,
                    addr.expected_amt_asset,
                    addr.status as address_status
                FROM ps_crypto_tx t
                LEFT JOIN ps_orders o ON t.order_id = o.id
                LEFT JOIN ps_currency c ON o.id_currency = c.id
                LEFT JOIN ps_crypto_order_addr addr ON t.order_id = addr.order_id AND addr.chain = JSON_EXTRACT(t.meta_json, '$.chain')
                WHERE t.created_at BETWEEN ? AND ?
                AND t.type IN ('payment', 'refund')
                ORDER BY t.created_at DESC
            `;

            const [rows] = await this.db.execute(query, [startDate + ' 00:00:00', endDate + ' 23:59:59']);

            return rows.map(row => ({
                transactionId: row.id,
                orderId: row.order_id,
                type: row.type,
                txHash: row.tx_hash,
                blockHeight: row.block_height,
                blockTime: row.block_time,
                amountCrypto: parseFloat(row.amount_asset),
                amountEUR: parseFloat(row.amount_eur),
                priceSource: row.price_source,
                orderTotal: parseFloat(row.total_paid_real),
                currency: row.currency_code,
                chain: row.chain,
                asset: row.asset,
                address: row.address,
                expectedAmount: parseFloat(row.expected_amt_asset),
                status: row.address_status,
                transactionDate: row.created_at,
                orderDate: row.order_date,
                meta: JSON.parse(row.meta_json || '{}')
            }));

        } catch (error) {
            console.error('MiCAComplianceService: Failed to get transaction data:', error);
            throw error;
        }
    }

    // Generate CSV content according to MiCA requirements
    generateCSVContent(transactions) {
        const headers = [
            'Transaction ID',
            'Order ID',
            'Type',
            'Transaction Hash',
            'Block Height',
            'Block Time',
            'Crypto Amount',
            'Asset',
            'Chain',
            'EUR Amount',
            'Price Source',
            'Order Total',
            'Order Currency',
            'Address',
            'Expected Amount',
            'Status',
            'Transaction Date',
            'Order Date',
            'Confirmations',
            'Risk Score'
        ];

        const rows = transactions.map(tx => [
            tx.transactionId,
            tx.orderId,
            tx.type,
            tx.txHash || '',
            tx.blockHeight || '',
            tx.blockTime || '',
            tx.amountCrypto.toFixed(8),
            tx.asset,
            tx.chain,
            tx.amountEUR ? tx.amountEUR.toFixed(2) : '',
            tx.priceSource || '',
            tx.orderTotal ? tx.orderTotal.toFixed(2) : '',
            tx.currency || '',
            tx.address || '',
            tx.expectedAmount ? tx.expectedAmount.toFixed(8) : '',
            tx.status || '',
            tx.transactionDate,
            tx.orderDate,
            tx.meta.confirmations || '',
            this.calculateRiskScore(tx) // Simple risk scoring
        ]);

        // Combine headers and rows
        const csvData = [headers, ...rows];

        // Convert to CSV string
        return csvData.map(row =>
            row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    }

    // Calculate simple risk score based on transaction characteristics
    calculateRiskScore(tx) {
        let score = 0;

        // Large transactions get higher risk
        if (tx.amountEUR > 10000) score += 2;
        else if (tx.amountEUR > 1000) score += 1;

        // New addresses get higher risk
        if (tx.status === 'pending') score += 1;

        // Low confirmations get higher risk
        const confirmations = tx.meta.confirmations || 0;
        if (confirmations < 6) score += 1;

        return Math.min(score, 5); // Max score of 5
    }

    // Generate monthly compliance report
    async generateMonthlyReport(year, month) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month

        return await this.generateMiCAExport(startDate, endDate);
    }

    // Generate rolling 12-month report
    async generateRollingReport() {
        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        const startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1).toISOString().split('T')[0];

        return await this.generateMiCAExport(startDate, endDate);
    }

    // Get compliance statistics
    async getComplianceStats() {
        try {
            const query = `
                SELECT
                    COUNT(*) as total_transactions,
                    SUM(amount_eur) as total_volume_eur,
                    AVG(amount_eur) as avg_transaction_eur,
                    COUNT(DISTINCT order_id) as unique_orders,
                    MAX(created_at) as last_transaction
                FROM ps_crypto_tx
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
                AND type = 'payment'
            `;

            const [rows] = await this.db.execute(query);
            return rows[0] || {};

        } catch (error) {
            console.error('MiCAComplianceService: Failed to get compliance stats:', error);
            throw error;
        }
    }

    // Validate compliance data completeness
    async validateComplianceData() {
        const issues = [];

        try {
            // Check for transactions without EUR amounts
            const [missingEur] = await this.db.execute(`
                SELECT COUNT(*) as count FROM ps_crypto_tx
                WHERE amount_eur IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            `);

            if (missingEur[0].count > 0) {
                issues.push(`${missingEur[0].count} transactions missing EUR conversion`);
            }

            // Check for transactions without proper metadata
            const [missingMeta] = await this.db.execute(`
                SELECT COUNT(*) as count FROM ps_crypto_tx
                WHERE (meta_json IS NULL OR meta_json = '{}')
                AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            `);

            if (missingMeta[0].count > 0) {
                issues.push(`${missingMeta[0].count} transactions missing metadata`);
            }

            return {
                valid: issues.length === 0,
                issues
            };

        } catch (error) {
            console.error('MiCAComplianceService: Validation failed:', error);
            return {
                valid: false,
                issues: ['Validation failed: ' + error.message]
            };
        }
    }
}

module.exports = MiCAComplianceService;