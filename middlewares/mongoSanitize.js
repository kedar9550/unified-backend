/**
 * Recursively sanitizes keys starting with '$' to protect against NoSQL Injection.
 * @param {*} obj 
 * @returns {*} Sanitized object
 */
const sanitize = (obj) => {
    if (obj instanceof Object) {
        for (const key in obj) {
            if (key.startsWith('$')) {
                delete obj[key];
            } else {
                sanitize(obj[key]);
            }
        }
    }
    return obj;
};

/**
 * Middleware to sanitize request query, body, and params
 */
const mongoSanitizeMiddleware = (req, res, next) => {
    req.body = sanitize(req.body);
    req.query = sanitize(req.query);
    req.params = sanitize(req.params);
    next();
};

module.exports = mongoSanitizeMiddleware;
