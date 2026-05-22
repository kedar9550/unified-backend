/**
 * Escapes characters that have special meaning in regular expressions
 * to prevent Regex Injection and ReDoS attacks.
 * @param {string} string 
 * @returns {string} Escaped string
 */
const escapeRegex = (string) => {
    if (typeof string !== 'string') return '';
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

module.exports = escapeRegex;
