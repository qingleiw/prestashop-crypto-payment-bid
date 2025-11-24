// HMAC verification: X-Request-Timestamp ±300s and X-Request-Signature = sha256(canonical_string), with replay defense

const crypto = require('crypto');

const processed = new Map();
const counts = new Map();

function verifyHMAC(req, secret) {
    const ts = req.headers['x-request-timestamp'];
    const sig = req.headers['x-request-signature'];
    if (!ts || !sig) return false;
    
    const timestamp = parseInt(ts);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) return false;
    
    const requestId = ${timestamp}::;
    if (processed.has(requestId)) return false;
    
    const body = req.body ? JSON.stringify(req.body) : '';
    const canonical = ${timestamp};
    const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
    
    if (sig !== expected) return false;
    processed.set(requestId, true);
    
    for (const [key] of processed) {
        if (parseInt(key.split(':')[0]) < now - 300) {
            processed.delete(key);
        }
    }
    return true;
}

function checkRateLimit(req) {
    const clientId = req.ip || 'unknown';
    const now = Math.floor(Date.now() / 60000);
    const key = ${clientId}:;
    
    const count = counts.get(key) || 0;
    if (count >= 100) return false;
    counts.set(key, count + 1);
    return true;
}

function hmacMiddleware(secret) {
    return (req, res, next) => {
        if (!checkRateLimit(req) || !verifyHMAC(req, secret)) {
            return res.status(401).json({ error: 'Authentication failed' });
        }
        next();
    };
}

module.exports = { hmacMiddleware, verifyHMAC, checkRateLimit };
