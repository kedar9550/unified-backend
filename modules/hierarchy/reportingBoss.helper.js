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
        const deptIds = await getHODDepartments(user, { excludeHODSchoolsForDean: true });
        
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

/**
 * Formats a role key or role name into a clean, human-readable display label.
 * e.g., 'DEPARTMENT_HOD' -> 'HOD', 'SCHOOL_DEAN' -> 'Dean', 'VICE_CHANCELLOR' -> 'Vice Chancellor'
 */
const formatRoleName = (roleKeyOrName) => {
    if (!roleKeyOrName) return 'HOD';
    const clean = roleKeyOrName.toString().trim().toUpperCase().replace(/[\s_]+/g, '_');
    
    switch (clean) {
        case 'HOD':
        case 'DEPARTMENT_HOD':
        case 'VEDA_HOD':
            return 'HOD';
        case 'SCHOOL_DEAN':
        case 'DEAN':
            return 'Dean';
        case 'VICE_CHANCELLOR':
            return 'Vice Chancellor';
        case 'DY_PRO_CHANCELLOR':
        case 'DY._PRO_CHANCELLOR':
            return 'Dy. Pro Chancellor';
        case 'REGISTRAR':
            return 'Registrar';
        case 'PRO_VICE_CHANCELLOR_E_S':
        case 'PRO_VICE_CHANCELLOR_(E_&_S)':
        case 'PRO_VICE-CHANCELLOR_(E_&_S)':
            return 'Pro Vice-Chancellor (E & S)';
        case 'PRO_VICE_CHANCELLOR_A':
        case 'PRO_VICE_CHANCELLOR_(A)':
        case 'PRO_VICE-CHANCELLOR_(A)':
            return 'Pro Vice-Chancellor (A)';
        case 'PRO_VICE_CHANCELLOR_S_P':
        case 'PRO_VICE_CHANCELLOR_(S_&_P)':
        case 'PRO_VICE-CHANCELLOR_(S_&_P)':
            return 'Pro Vice-Chancellor (S & P)';
        case 'DEAN_IQAC':
        case 'DEAN_-_(IQAC)':
        case 'DEAN_(IQAC)':
            return 'Dean (IQAC)';
        case 'DEAN_ADMISSIONS':
        case 'DEAN_-_(ADMISSIONS)':
        case 'DEAN_(ADMISSIONS)':
            return 'Dean (Admissions)';
        case 'CONTROLLER_OF_EXAMINATIONS':
            return 'Controller of Examinations';
        default:
            return roleKeyOrName
                .toString()
                .toLowerCase()
                .split(/[\s_]+/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
    }
};

/**
 * Dynamically resolves the primary evaluator's display title for notifications
 * (e.g., 'HOD', 'Dean', 'Registrar', 'Vice Chancellor').
 * 
 * Checks in order:
 * 1. Special HierarchyMapping for the applicant (e.g. EmpId -> RoleId).
 * 2. Active role passed via request header ('active-role').
 * 3. School/Department configuration for the applicant (if school has no HOD, returns 'Dean').
 * 4. Logged-in user's roles from req.user.roles or UserAppRole in DB.
 * 5. Approver's designation or fallback to 'HOD'.
 */
const getApproverRoleTitle = async (req, applicantFacultyId) => {
    try {
        const userId = req.user?.userId || req.user?._id;

        // 1. Check if the applicant is specially mapped in HierarchyMapping
        if (applicantFacultyId) {
            const applicantEmp = await Employee.findById(applicantFacultyId).select('institutionId coreDepartment department');
            if (applicantEmp?.institutionId) {
                const specialMapping = await HierarchyMapping.findOne({ empId: applicantEmp.institutionId }).populate('roleId');
                if (specialMapping?.roleId) {
                    const mappedRoleName = specialMapping.roleId.name || specialMapping.roleId.key;
                    if (mappedRoleName) {
                        return formatRoleName(mappedRoleName);
                    }
                }
            }
        }

        // 2. Check active-role header sent by frontend
        const activeRole = req.headers?.['active-role'];
        if (activeRole) {
            const normalized = activeRole.toUpperCase().trim();
            if (['HOD', 'DEPARTMENT_HOD', 'VEDA_HOD'].includes(normalized)) {
                return 'HOD';
            }
            if (['SCHOOL_DEAN', 'DEAN'].includes(normalized)) {
                return 'Dean';
            }
            if (!['FACULTY', 'USER', 'STAFF'].includes(normalized)) {
                return formatRoleName(activeRole);
            }
        }

        // 3. Check departmental routing (School Dean vs HOD)
        if (applicantFacultyId) {
            const applicantEmp = await Employee.findById(applicantFacultyId).select('institutionId coreDepartment department');
            const deptId = applicantEmp?.coreDepartment || applicantEmp?.department;
            if (deptId) {
                // Ensure School model is registered before populating
                require('../academics/school.model');
                const Department = require('../academics/department.model');
                const department = await Department.findById(deptId).populate('schoolIds');
                if (department) {
                    const isHODRouted = department.schoolIds && department.schoolIds.some(school => school.hod === true);
                    if (!isHODRouted && department.schoolIds && department.schoolIds.length > 0) {
                        return 'Dean';
                    }
                }
            }
        }

        // 4. Check approver's roles from req.user.roles or UserAppRole
        if (req.user?.roles && Array.isArray(req.user.roles)) {
            const userRoleNames = req.user.roles.map(r => (r.role?.name || r.role?.key || r.key || r.role || '').toUpperCase().trim());
            if (userRoleNames.some(r => ['SCHOOL_DEAN', 'SCHOOL DEAN'].includes(r))) {
                return 'Dean';
            }
            if (userRoleNames.some(r => ['HOD', 'DEPARTMENT_HOD', 'DEPARTMENT HOD', 'VEDA_HOD'].includes(r))) {
                return 'HOD';
            }
            const matchingRole = userRoleNames.find(r => 
                ['VICE_CHANCELLOR', 'VICE CHANCELLOR', 'REGISTRAR', 'DY_PRO_CHANCELLOR', 'DY. PRO CHANCELLOR', 
                 'PRO_VICE_CHANCELLOR_E_S', 'PRO_VICE_CHANCELLOR_A', 'PRO_VICE_CHANCELLOR_S_P',
                 'DEAN_IQAC', 'DEAN - (IQAC)', 'DEAN_ADMISSIONS', 'DEAN - (ADMISSIONS)',
                 'CONTROLLER_OF_EXAMINATIONS', 'CONTROLLER OF EXAMINATIONS'].includes(r)
            );
            if (matchingRole) {
                return formatRoleName(matchingRole);
            }
        }

        if (userId) {
            const userAppRoles = await UserAppRole.find({ userId }).populate('role');
            for (const uar of userAppRoles) {
                const key = uar.role?.key || uar.role?.name || '';
                const upper = key.toUpperCase().trim();
                if (['SCHOOL_DEAN', 'SCHOOL DEAN'].includes(upper)) return 'Dean';
                if (['HOD', 'DEPARTMENT_HOD', 'DEPARTMENT HOD'].includes(upper)) return 'HOD';
                if (['VICE_CHANCELLOR', 'VICE CHANCELLOR', 'REGISTRAR', 'DY_PRO_CHANCELLOR', 'DY. PRO CHANCELLOR'].includes(upper)) {
                    return formatRoleName(uar.role?.name || key);
                }
            }
        }

        return 'HOD';
    } catch (err) {
        console.error("Error determining approver role title:", err);
        return 'HOD';
    }
};

module.exports = {
    getReportingBossId,
    getFacultyIdsForApprover,
    getApproverRoleTitle,
    formatRoleName
};
