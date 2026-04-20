const Role = require('./role.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const User = require('../user/user.model');

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private (Admin/UniPrime)
exports.getRoles = async (req, res, next) => {
    try {
        const roles = await Role.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: roles
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create a new role
// @route   POST /api/roles
// @access  Private (Admin/UniPrime)
exports.createRole = async (req, res, next) => {
    try {
        const { name, description } = req.body;
        
        // Check if role already exists
        const existingRole = await Role.findOne({ name: name.toUpperCase() });
        if (existingRole) {
            return res.status(400).json({
                success: false,
                message: 'Role already exists'
            });
        }

        const role = await Role.create({
            name,
            description
        });

        res.status(201).json({
            success: true,
            data: role
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a role
// @route   PUT /api/roles/:id
// @access  Private (Admin/UniPrime)
exports.updateRole = async (req, res, next) => {
    try {
        const role = await Role.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        res.status(200).json({
            success: true,
            data: role
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a role
// @route   DELETE /api/roles/:id
// @access  Private (Admin/UniPrime)
exports.deleteRole = async (req, res, next) => {
    try {
        const role = await Role.findByIdAndDelete(req.params.id);

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Also remove all user mappings for this role
        await UserAppRole.deleteMany({ role: req.params.id });

        res.status(200).json({
            success: true,
            message: 'Role deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Assign user to role
// @route   POST /api/roles/assign
// @access  Private (Admin/UniPrime)
exports.assignUserToRole = async (req, res, next) => {
    try {
        const { userId, roleId } = req.body;
        const app = process.env.APP_NAME || 'UNIFIED_SYSTEM';

        // Check if mapping exists
        const existingMapping = await UserAppRole.findOne({ userId, role: roleId, app });
        if (existingMapping) {
            return res.status(400).json({
                success: false,
                message: 'User already assigned to this role'
            });
        }

        const mapping = await UserAppRole.create({
            userId,
            role: roleId,
            app
        });

        res.status(201).json({
            success: true,
            data: mapping
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get users for a role
// @route   GET /api/roles/:id/users
// @access  Private (Admin/UniPrime)
exports.getRoleUsers = async (req, res, next) => {
    try {
        const mappings = await UserAppRole.find({ role: req.params.id })
            .populate('userId', 'name institutionId email userType');
        
        const users = mappings.map(m => m.userId).filter(u => u !== null);

        res.status(200).json({
            success: true,
            data: users
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Remove user from role
// @route   DELETE /api/roles/:id/users/:userId
// @access  Private (Admin/UniPrime)
exports.removeUserFromRole = async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const app = process.env.APP_NAME || 'UNIFIED_SYSTEM';

        const mapping = await UserAppRole.findOneAndDelete({ userId, role: id, app });

        if (!mapping) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'User removed from role'
        });
    } catch (error) {
        next(error);
    }
};
// @desc    Get roles for a specific user
// @route   GET /api/roles/user/:userId
// @access  Private (Admin/UniPrime)
exports.getUserRoles = async (req, res, next) => {
    try {
        const mappings = await UserAppRole.find({ userId: req.params.userId })
            .populate('role', 'name description');
        
        const roles = mappings.map(m => m.role).filter(r => r !== null);

        res.status(200).json({
            success: true,
            data: roles
        });
    } catch (error) {
        next(error);
    }
};

const getIdentityBasedRoleName = (userType, designation) => {
    if (userType === "Student") return "STUDENT";
    const desig = (designation || "").toLowerCase();
    if (/prof|professor|ass|teaching|ph\.?d\.?\s*full[- ]?time\s*scholar/i.test(desig)) return "FACULTY";
    if (/technician|programmer/i.test(desig)) return "TECHNICIAN";
    return "STAFF";
};

// @desc    Sync user roles (Bulk Update with Default Role Enforcement)
// @route   POST /api/roles/user/sync
// @access  Private (Admin/UniPrime)
exports.syncUserRoles = async (req, res, next) => {
    try {
        const { userId, roleIds, hodDepartments } = req.body;
        const app = process.env.APP_NAME || 'UNIFIED_SYSTEM';

        // 1. Fetch user to check identity
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // 2. Identify default roles and HOD in the provided selection
        const selectedRoles = await Role.find({ _id: { $in: roleIds } });
        const selectedDefaultRoles = selectedRoles.filter(r => r.defaultRole);
        const hodRole = selectedRoles.find(r => r.name === 'HOD');

        // 3. Enforcement: Exactly one default role
        let finalRoleIds = [...roleIds];
        
        if (selectedDefaultRoles.length > 1) {
            return res.status(400).json({
                success: false,
                message: `User can only have one default role. Found: ${selectedDefaultRoles.map(r => r.name).join(', ')}`
            });
        }

        if (selectedDefaultRoles.length === 0) {
            const identityRoleName = getIdentityBasedRoleName(user.userType, user.designation);
            let idRole = await Role.findOne({ name: identityRoleName, app });
            
            if (!idRole) {
                idRole = await Role.create({ name: identityRoleName, app, defaultRole: true, description: `System Role` });
            }
            finalRoleIds.push(idRole._id.toString());
        }

        // 4. Update mappings
        await UserAppRole.deleteMany({ userId, app });

        const mappings = finalRoleIds.map(roleId => {
            const mapping = {
                userId,
                role: roleId,
                app
            };
            // Apply department context if it's the HOD role
            if (hodRole && roleId === hodRole._id.toString()) {
                mapping.departments = hodDepartments || [];
            }
            return mapping;
        });
        
        await UserAppRole.insertMany(mappings);

        res.status(200).json({
            success: true,
            message: 'User roles and context updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Reconcile default roles for all users (Migration)
// @route   POST /api/roles/reconcile-all
// @access  Private (Admin/UniPrime)
exports.reconcileAllUserRoles = async (req, res, next) => {
    try {
        const app = process.env.APP_NAME || 'UNIFIED_SYSTEM';
        const users = await User.find();
        let updatedCount = 0;

        for (const user of users) {
            const identityRoleName = getIdentityBasedRoleName(user.userType, user.designation);
            
            // Find appropriate role
            let idRole = await Role.findOne({ name: identityRoleName, app });
            if (!idRole) {
                idRole = await Role.create({ name: identityRoleName, app, defaultRole: true, description: `System Role` });
            } else if (!idRole.defaultRole) {
                idRole.defaultRole = true;
                await idRole.save();
            }

            // Check if user has this role
            const existingMapping = await UserAppRole.findOne({ userId: user._id, role: idRole._id, app });
            
            // Check if user has other default roles
            const otherMappings = await UserAppRole.find({ userId: user._id, app }).populate('role');
            const otherDefaultRoles = otherMappings.filter(m => m.role?.defaultRole && m.role?.name !== identityRoleName);

            if (!existingMapping || otherDefaultRoles.length > 0) {
                // Fix: Remove extra default roles, ensure identity-based one exists
                if (otherDefaultRoles.length > 0) {
                    const idsToRemove = otherDefaultRoles.map(m => m._id);
                    await UserAppRole.deleteMany({ _id: { $in: idsToRemove } });
                }

                if (!existingMapping) {
                    await UserAppRole.create({ userId: user._id, role: idRole._id, app });
                }
                updatedCount++;
            }
        }

        res.status(200).json({
            success: true,
            message: `Reconciliation complete. Updated ${updatedCount} users.`
        });
    } catch (error) {
        next(error);
    }
};
