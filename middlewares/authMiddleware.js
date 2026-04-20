const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Middleware to protect routes and verify JWT tokens
 * Reads from Authorization header (Bearer) OR cookie
 */
const protect = async (req, res, next) => {
    let token;

    // 1. Try Bearer token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    // 2. Fallback to cookie
    if (!token && req.cookies?.token) {
        token = req.cookies.token;
    }

    if (!token) {
        res.status(401);
        return next(new Error('Not authorized, no token'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { userId, app, roles }
        next();
    } catch (error) {
        console.error('Authorization error:', error.message);
        res.status(401);
        return next(new Error('Not authorized, token failed'));
    }
};


/**
 * Role-based authorization middleware
 * Usage: authorize('SUPER_ADMIN', 'EXAM_CELL')
 * Checks roles scoped to the app stored in the JWT
 */
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.roles) {
            res.status(403);
            return next(new Error('Access denied: no roles found'));
        }

        // req.user.roles = [{ role: 'EXAM_CELL', app: 'UNIFIED_SYSTEM' }, ...]
        const userRoleNames = req.user.roles.map(r => r.role?.toUpperCase());

        const hasRole = allowedRoles.some(role =>
            userRoleNames.includes(role.toUpperCase())
        );

        if (!hasRole) {
            res.status(403);
            return next(
                new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}`)
            );
        }

        next();
    };
};

module.exports = { protect, authorize };
