/**
 * Normalizes period data from request body or query params.
 * If 'semester' is provided, it maps it to 'periodType' = 'SEMESTER' and 'periodValue'.
 * 
 * @param {Object} data - The request data (body or query)
 * @returns {Object} - The normalized period data
 */
const normalizePeriod = (data) => {
    // Handle case-insensitivity (e.g. from CSV parser normalization)
    const pType = data.periodType || data.periodtype || (data.semester ? "SEMESTER" : undefined);
    const pValue = data.periodValue || data.periodvalue || data.semester;

    return {
        periodType: (pType || "SEMESTER").toUpperCase(),
        periodValue: pValue ? Number(pValue) : undefined
    };
};

/**
 * Returns a query object with period filters.
 * 
 * @param {Object} data - The request data
 * @param {Object} query - Existing query object
 * @returns {Object} - Updated query object
 */
const withPeriodFilter = (data, query = {}) => {
    const { periodType, periodValue } = normalizePeriod(data);
    
    if (periodType) query.periodType = periodType;
    if (periodValue) query.periodValue = periodValue;
    
    return query;
};

module.exports = {
    normalizePeriod,
    withPeriodFilter
};
