const User = require('../modules/user/user.model');
const UserAppRole = require('../modules/userAppRole/userAppRole.model');
const Role = require('../modules/role/role.model');

const loginUser = async (institutionId, password, appName) => {
    // 1. Find User
    const user = await User.findOne({ institutionId });
    if (!user) {
        throw new Error('Invalid credentials');
    }

    // 2. Match Password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        throw new Error('Invalid credentials');
    }

    // 3. Prevent inactive logins
    if (user.isActive === false) {
        throw new Error('User account is deactivated');
    }

    // 4. Fetch roles associated with the specific app
    const userAppRoles = await UserAppRole.find({ userId: user._id, app: appName }).populate('role');
    
    // Map them out nicely
    const roles = userAppRoles.map(uar => ({
        role: uar.role.name,
        app: uar.app,
        permissions: [] // Expand this later if Role schema tracks permissions
    }));

    if (!roles || roles.length === 0) {
        // According to strict enterprise flow, user needs a role to login to the app
        throw new Error('User not authorized for this application');
    }

    return {
        user,
        roles
    };
};

module.exports = {
    loginUser
};
