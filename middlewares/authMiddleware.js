const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const Employee = require('../modules/employee/employee.model');
const Student = require('../modules/StudentData/Studentdata.model');

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

        // Check if user is still active in the database
        let isActive = true;
        if (decoded.userType === 'Employee') {
            const emp = await Employee.findById(decoded.userId).select('isActive');
            if (emp && emp.isActive === false) isActive = false;
        } else if (decoded.userType === 'Student') {
            const student = await Student.findById(decoded.userId).select('system.isActive');
            if (student && student.system?.isActive === false) isActive = false;
        }

        if (!isActive) {
            res.status(401);
            return next(new Error('User account is deactivated. Please log in again.'));
        }

        req.user = decoded; // { userId, app, roles }

        // Extract HOD departments if they exist in roles
        if (req.user.roles) {
            const hodRole = req.user.roles.find(r => r.role?.toUpperCase() === 'HOD');
            if (hodRole && hodRole.departments) {
                req.user.hodDepartments = hodRole.departments;
            }
        }

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

        // req.user.roles = [{ role: { key: 'HOD', name: 'HOD' }, app: 'UNIFIED_SYSTEM' }, ...]
        const userRoleNames = req.user.roles.flatMap(r => {
            const roleName = (r.role?.name || '').toUpperCase().trim();
            const roleKey = (r.role?.key || '').toUpperCase().trim();
            const roleDirect = (typeof r === 'string' ? r : (typeof r.role === 'string' ? r.role : '')).toUpperCase().trim();
            return [roleName, roleKey, roleDirect].filter(Boolean);
        });

        const hasRole = allowedRoles.some(role =>
            userRoleNames.includes(role.toUpperCase().trim())
        );

        if (!hasRole) {
            console.log("Auth 403. allowed:", allowedRoles, "userRoles:", userRoleNames);
            // Temporary fallback if active-role is valid
            const activeRole = req.headers['active-role'];
            if (activeRole && allowedRoles.some(role => role.toUpperCase().trim() === activeRole.toUpperCase().trim())) {
                console.log("Allowing based on active-role header");
                return next();
            }
            res.status(403);
            return next(
                new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}`)
            );
        }

        next();
    };
};

module.exports = { protect, authorize };
