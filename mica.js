// MiCA CSV hook and rolling 12-month totals
// Pseudocode for appending to CSV and computing rolling totals

const fs = require('fs');
const path = require('path');

// CSV file path (per your directory policy, e.g., repo/var/mica.csv)
const CSV_FILE = path.join(__dirname, 'var', 'mica.csv');

// Sample row structure
const sampleRow = {
    fecha_iso: '2023-10-01T12:00:00Z',
    tipo: 'venta', // or 'lp_exit'
    tx_hash: '0x123...',
    par: 'EUR/USDC',
    token_entregado: 'USDC',
    monto_token_entregado: 1000,
    token_recibido: 'EUR',
    monto_token_recibido: 950,
    precio_referencia_eur: 0.95,
    contravalor_eur: 950,
    fuente_precio: 'CoinGecko',
    computable: true,
    nota: ''
};

// Function to append row to CSV
function appendMiCARow(row) {
    const csvLine = Object.values(row).join(',') + '\n';
    fs.appendFileSync(CSV_FILE, csvLine);
}

// Pseudocode for rolling 12-month totals
function computeRollingTotals() {
    const data = fs.readFileSync(CSV_FILE, 'utf8').split('\n').filter(line => line);
    const rows = data.map(line => {
        const parts = line.split(',');
        return {
            fecha_iso: parts[0],
            contravalor_eur: parseFloat(parts[9]),
            computable: parts[11] === 'true'
        };
    });

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    let totalEUR = 0;
    rows.forEach(row => {
        if (row.computable && new Date(row.fecha_iso) >= twelveMonthsAgo) {
            totalEUR += row.contravalor_eur;
        }
    });

    // Stop hints
    if (totalEUR >= 950000) {
        console.warn('Approaching MiCA threshold: €950k');
    }
    if (totalEUR >= 1000000) {
        console.error('MiCA cap exceeded: €1M - Operational stop required');
    }

    return totalEUR;
}

// Usage
appendMiCARow(sampleRow);
const total = computeRollingTotals();
console.log('Rolling 12-month total:', total);