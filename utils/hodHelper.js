const UserAppRole = require('../modules/userAppRole/userAppRole.model');
const Role = require('../modules/role/role.model');
const Department = require('../modules/academics/department.model');

/**
 * Get departments for an HOD or SCHOOL_DEAN.
 * Tries to get from req.user first (populated by middleware from token), 
 * then falls back to database lookup if empty.
 * 
 * @param {Object} user - The req.user object
 * @returns {Promise<Array>} - Array of department ObjectIds
 */
const getHODDepartments = async (user) => {
    // 1. Try from req.user (already populated by middleware from token)
    let deptIds = (user.hodDepartments || []).map(d => 
        (typeof d === 'object' && d._id) ? d._id.toString() : d.toString()
    );

    // 2. Fallback to Database Lookup if token doesn't have them or is empty
    if (deptIds.length === 0) {
        const hodRoleDoc = await Role.findOne({ key: 'HOD', app: process.env.APP_NAME || 'UNIFIED_SYSTEM' });
        const deanRoleDoc = await Role.findOne({ key: 'SCHOOL_DEAN', app: process.env.APP_NAME || 'UNIFIED_SYSTEM' });
        
        const rolesToFind = [];
        if (hodRoleDoc) rolesToFind.push(hodRoleDoc._id);
        if (deanRoleDoc) rolesToFind.push(deanRoleDoc._id);

        if (rolesToFind.length > 0) {
            const mappings = await UserAppRole.find({ 
                userId: user.userId || user._id, 
                role: { $in: rolesToFind } 
            });
            
            for (const m of mappings) {
                if (hodRoleDoc && m.role.toString() === hodRoleDoc._id.toString() && m.departments) {
                    deptIds = [...deptIds, ...m.departments.map(d => d.toString())];
                } else if (deanRoleDoc && m.role.toString() === deanRoleDoc._id.toString() && m.schools && m.schools.length > 0) {
                    // Fetch all departments that belong to these schools
                    const depts = await Department.find({ schoolIds: { $in: m.schools } });
                    deptIds = [...deptIds, ...depts.map(d => d._id.toString())];
                }
            }
            // De-duplicate
            deptIds = [...new Set(deptIds)];
        }
    }

    return deptIds;
};

const getHODByDepartment = async (departmentId) => {
    const department = await Department.findById(departmentId).populate('schoolIds');
    if (!department) return null;

    const isHODRouted = department.schoolIds && department.schoolIds.some(school => 
        school.code === 'SOE' || school.code === 'SOC'
    );

    if (isHODRouted || !department.schoolIds || department.schoolIds.length === 0) {
        // Route to HOD
        const hodRoleDoc = await Role.findOne({ 
            name: 'HOD', 
            app: process.env.APP_NAME || 'UNIFIED_SYSTEM' 
        });
        if (!hodRoleDoc) return null;
        
        const mapping = await UserAppRole.findOne({ 
            role: hodRoleDoc._id,
            departments: departmentId 
        });
        
        return mapping ? mapping.userId : null;
    } else {
        // Route to SCHOOL_DEAN
        const deanRoleDoc = await Role.findOne({ 
            name: 'SCHOOL_DEAN', 
            app: process.env.APP_NAME || 'UNIFIED_SYSTEM' 
        });
        if (!deanRoleDoc) return null;

        const schoolIds = department.schoolIds.map(s => s._id);

        const mapping = await UserAppRole.findOne({ 
            role: deanRoleDoc._id,
            schools: { $in: schoolIds }
        });

        return mapping ? mapping.userId : null;
    }
};

module.exports = { getHODDepartments, getHODByDepartment };
