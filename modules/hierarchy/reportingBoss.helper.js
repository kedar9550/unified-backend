const Employee = require('../employee/employee.model');
const HierarchyMapping = require('./HierarchyMapping.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const { getHODByDepartment } = require('../../utils/hodHelper');

/**
 * Gets the reporting boss User ID for a given employee.
 * 1. Checks HierarchyMapping for a special case EmpId -> RoleId.
 *    If found, looks up who holds that RoleId and returns their userId.
 * 2. If not found, falls back to the default getHODByDepartment logic.
 * 
 * @param {String} userId - The Object ID of the User/Employee making the request
 * @returns {Promise<String|null>} - The userId of the reporting boss
 */
const getReportingBossId = async (userId) => {
    try {
        const emp = await Employee.findById(userId);
        if (!emp) return null;

        // 1. Check Special Cases
        if (emp.institutionId) {
            const specialMapping = await HierarchyMapping.findOne({ 
                empId: emp.institutionId 
            });

            if (specialMapping && specialMapping.roleId) {
                // Find who holds this role (assuming it's a unique role like VC, Registrar)
                const roleHolder = await UserAppRole.findOne({ role: specialMapping.roleId });
                if (roleHolder && roleHolder.userId) {
                    return roleHolder.userId.toString();
                }
            }
        }

        // 2. Fallback to default school logic (HOD or School Dean)
        // Note: hodHelper's getHODByDepartment handles both HOD and School Dean correctly
        const deptId = emp.coreDepartment || emp.department;
        if (deptId) {
            const bossUserId = await getHODByDepartment(deptId);
            return bossUserId ? bossUserId.toString() : null;
        }

        return null;
    } catch (error) {
        console.error("Error getting reporting boss:", error);
        return null;
    }
};

module.exports = {
    getReportingBossId
};
