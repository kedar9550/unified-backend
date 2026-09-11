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

/**
 * Gets all faculty IDs for which the currently logged-in user is the approver.
 * 1. Checks HierarchyMapping for special mappings where the user holds the approver role.
 * 2. Checks regular HOD/Dean department assignments, excluding employees mapped elsewhere.
 * 
 * @param {Object} user - The req.user object
 * @returns {Promise<Array<String>>} - Array of ObjectIds (as strings) of the faculty members
 */
const getFacultyIdsForApprover = async (user) => {
    try {
        const userId = user.userId || user._id;

        // 1. Find all roles held by the user
        const userRoles = await UserAppRole.find({ userId }).distinct('role');

        // 2. Find employees specially mapped to this user's roles
        const specialMappings = await HierarchyMapping.find({ roleId: { $in: userRoles } });
        const specialEmpIds = specialMappings.map(m => m.empId);
        
        // Convert institutionIds to ObjectIds of the employees
        const specialFacultyIds = await Employee.find({ institutionId: { $in: specialEmpIds } }).distinct('_id');

        // 3. Find all employees who have a special mapping (to ANYONE) so we can exclude them from regular department routing
        const allMappedEmpIds = await HierarchyMapping.find().distinct('empId');
        const allMappedFacultyIds = await Employee.find({ institutionId: { $in: allMappedEmpIds } }).distinct('_id');

        // 4. Regular department-based routing
        const { getHODDepartments } = require('../../utils/hodHelper'); // Ensure we get the latest if there are circular dependencies
        const deptIds = await getHODDepartments(user);
        
        let regularFacultyIds = [];
        if (deptIds && deptIds.length > 0) {
            regularFacultyIds = await Employee.find({
                $and: [
                    {
                        $or: [
                            { coreDepartment: { $in: deptIds } },
                            { department: { $in: deptIds } }
                        ]
                    },
                    { _id: { $nin: allMappedFacultyIds } }
                ]
            }).distinct('_id');
        }

        // Combine and deduplicate
        const finalIds = [...new Set([
            ...specialFacultyIds.map(id => id.toString()),
            ...regularFacultyIds.map(id => id.toString())
        ])];

        return finalIds;
    } catch (error) {
        console.error("Error getting faculty IDs for approver:", error);
        return [];
    }
};

module.exports = {
    getReportingBossId,
    getFacultyIdsForApprover
};
