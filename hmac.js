// HMAC security verification for backend endpoints
// Node.js/Express middleware for timestamped HMAC with replay window and rate limiting

const crypto = require('crypto');
const express = require('express');
const app = express();

const HMAC_SECRET = process.env.HMAC_SECRET;
const REPLAY_WINDOW = 300; // ±300 seconds
const processedRequests = new Map(); // Simple in-memory store for replay defense (use Redis in prod)

// Middleware to verify HMAC
function verifyHMAC(req, res, next) {
    const timestamp = req.headers['x-request-timestamp'];
    const signature = req.headers['x-request-signature'];
    const method = req.method;
    const path = req.path;
    const body = JSON.stringify(req.body || {});

    if (!timestamp || !signature) {
        return res.status(401).json({ error: 'Missing HMAC headers' });
    }

    const ts = parseInt(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > REPLAY_WINDOW) {
        return res.status(401).json({ error: 'Timestamp out of window' });
    }

    // Replay defense: Check if request ID (ts + method + path) already processed
    const requestId = `${ts}:${method}:${path}`;
    if (processedRequests.has(requestId)) {
        return res.status(401).json({ error: 'Replay detected' });
    }

    // Canonical string: ts.method.path.body
    const canonicalString = `${ts}${method}${path}${body}`;
    const expectedSignature = crypto.createHmac('sha256', HMAC_SECRET).update(canonicalString).digest('hex');

    if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Mark as processed
    processedRequests.set(requestId, true);
    // Cleanup old entries (simple GC)
    for (const [key, value] of processedRequests) {
        if (parseInt(key.split(':')[0]) < now - REPLAY_WINDOW) {
            processedRequests.delete(key);
        }
    }

    next();
}

// Rate limiting (simple, use express-rate-limit in prod)
let requestCount = 0;
setInterval(() => { requestCount = 0; }, 60000); // Reset every minute

function rateLimit(req, res, next) {
    if (requestCount > 100) { // 100 requests per minute
        return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    requestCount++;
    next();
}

// Apply to routes
app.use(rateLimit);
app.post('/wallet/generate', verifyHMAC, (req, res) => {
    // Generate address logic here
    res.json({ address: '0x...', derivationPath: 'm/44\'/60\'/0\'/0/12345' });
});

app.listen(3000, () => console.log('Server running'));