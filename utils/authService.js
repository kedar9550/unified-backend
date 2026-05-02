const Employee = require('../modules/employee/employee.model');
const Student = require('../modules/StudentData/Studentdata.model');
const UserAppRole = require('../modules/userAppRole/userAppRole.model');
const Role = require('../modules/role/role.model');

const loginUser = async (institutionId, password, appName) => {
    // Determine user type based on ID pattern
    // Employees have numeric IDs (e.g., 1, 2, 100)
    // Students have alphanumeric IDs (e.g., 24B11AE001)
    let user = await Employee.findOne({ institutionId }).populate('department', 'name');
    let userType = 'Employee';

    if (!user) {
        user = await Student.findOne({ rollNo: institutionId.toUpperCase() }).populate('academicInfo.department', 'name');
        userType = 'Student';
    }

    if (!user) {
        throw new Error('Invalid credentials');
    }

    // Match Password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        throw new Error('Invalid credentials');
    }

    // Prevent inactive logins
    const isActive = userType === 'Employee' ? user.isActive : user.system?.isActive;
    if (isActive === false) {
        throw new Error('User account is deactivated');
    }

    // Fetch roles associated with the specific app
    const userAppRoles = await UserAppRole.find({ userId: user._id, app: appName }).populate('role');
    
    // Map them out nicely
    const roles = userAppRoles.map(uar => ({
        role: uar.role.name,
        app: uar.app,
        departments: uar.departments || [],
        permissions: [] 
    }));

    if (!roles || roles.length === 0) {
        throw new Error('User not authorized for this application');
    }

    const normalizedUser = normalizeUser(user, userType);

    return {
        user: normalizedUser,
        roles
    };
};

const normalizeUser = (user, userType) => {
    const toTitleCase = (str) => {
        if (!str) return str;
        return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    return {
        _id: user._id,
        name: toTitleCase(userType === 'Employee' ? user.name : user.personalInfo?.studentName),
        institutionId: userType === 'Employee' ? user.institutionId : user.rollNo,
        email: userType === 'Employee' ? user.email : user.contactInfo?.emailId,
        phone: userType === 'Employee' ? user.phone : user.contactInfo?.mobileNumber,
        department: userType === 'Employee' ? (user.department?.name || user.department) : (user.academicInfo?.department?.name || user.academicInfo?.department),
        designation: userType === 'Employee' ? user.designation : 'Student',
        userType: userType,
        profileImage: userType === 'Employee' ? user.profileImage : null,
        scopusId: userType === 'Employee' ? user.scopusId : "",
        wosId: userType === 'Employee' ? user.wosId : "",
        orcidId: userType === 'Employee' ? user.orcidId : "",
        googleScholarId: userType === 'Employee' ? user.googleScholarId : "",
        panNumber: userType === 'Employee' ? user.panNumber : "",
        college: userType === 'Employee' ? user.college : "",
    };
};

module.exports = {
    loginUser,
    normalizeUser
};
