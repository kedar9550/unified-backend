const jwt = require('jsonwebtoken');

const generateToken = (payload, res) => {
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
        httpOnly: true,
        secure: isProd, // True in production, prevents the cookie from being sent over plain HTTP
        sameSite: isProd ? 'none' : 'lax', // 'none' needed for cross-domain in prod, 'lax' is fine for local
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return token;
};

module.exports = generateToken;
