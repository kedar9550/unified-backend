const jwt = require('jsonwebtoken');

const generateToken = (payload, res) => {
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
        httpOnly: true,
        secure: isProd, // secure cookies only in production
        sameSite: 'none', // required for cross-site requests from the frontend dev server
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return token;
};

module.exports = generateToken;
