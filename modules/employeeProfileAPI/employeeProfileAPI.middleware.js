const crypto = require('crypto');

const verifyApikey = (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.header('x-api-key');
        const secretKey = process.env.EMPLOYEE_PROFILE_API_KEY;

        if (!secretKey) {
            return res.status(500).json({
                success: false,
                message: 'API key is not configured on the server'
            });
        }

        if (!apiKey || typeof apiKey !== 'string') {
            return res.status(401).json({
                success: false,
                message: 'API key is required in x-api-key header'
            });
        }

        const providedHash = crypto.createHash('sha256').update(apiKey).digest();
        const expectedHash = crypto.createHash('sha256').update(secretKey).digest();

        if (!crypto.timingSafeEqual(providedHash, expectedHash)) {
            return res.status(403).json({
                success: false,
                message: 'Invalid API key'
            });
        }

        next();
    } catch (error) {
        console.error('API key verification error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal server error during authentication'
        });
    }
};

module.exports = verifyApikey;