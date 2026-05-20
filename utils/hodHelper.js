const UserAppRole = require('../modules/userAppRole/userAppRole.model');
const Role = require('../modules/role/role.model');

/**
 * Get departments for an HOD.
 * Tries to get from req.user first (populated by middleware from token), 
 * then falls back to database lookup if empty.
 * 
 * @param {Object} user - The req.user object
 * @returns {Promise<Array>} - Array of department ObjectIds
 */
const getHODDepartments = async (user) => {
    // 1. Try from req.user (already populated by middleware from token)
    let deptIds = user.hodDepartments || [];

    // 2. Fallback to Database Lookup if token doesn't have them or is empty
    if (deptIds.length === 0) {
        const hodRoleDoc = await Role.findOne({ 
            name: 'HOD', 
            app: process.env.APP_NAME || 'UNIFIED_SYSTEM' 
        });
        
        if (hodRoleDoc) {
            const mappings = await UserAppRole.find({ 
                userId: user.userId || user._id, 
                role: hodRoleDoc._id 
            });
            
            for (const m of mappings) {
                if (m.departments && m.departments.length > 0) {
                    deptIds = [...deptIds, ...m.departments.map(d => d.toString())];
                }
            }
            // De-duplicate
            deptIds = [...new Set(deptIds)];
        }
    }

    return deptIds;
};

module.exports = { getHODDepartments };
