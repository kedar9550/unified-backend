const LeadershipRole = require('./LeadershipRole.model');
const Employee = require('../employee/employee.model');

// @desc    Assign leadership role to employee
// @route   POST /api/leadership-roles
// @access  Private (UNIPRIME)
exports.assignLeadershipRole = async (req, res, next) => {
    try {
        const { employeeId, role } = req.body;

        if (!employeeId || !role) {
            return res.status(400).json({
                success: false,
                message: 'employeeId and role are required'
            });
        }

        const allowedRoles = ['Deans', 'Associate Deans', 'CoE', 'HoD'];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `Invalid role. Must be one of: ${allowedRoles.join(', ')}`
            });
        }

        // Verify employee exists
        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Find or create the leadership role document, and push employeeId if not present
        let leadershipRole = await LeadershipRole.findOne({ roleName: role });
        if (!leadershipRole) {
            leadershipRole = await LeadershipRole.create({
                roleName: role,
                assignedFaculty: [employeeId]
            });
        } else {
            if (!leadershipRole.assignedFaculty.includes(employeeId)) {
                leadershipRole.assignedFaculty.push(employeeId);
                await leadershipRole.save();
            }
        }

        // Synchronize all employee leadership flags
        await LeadershipRole.syncAllEmployeesLeadership();

        res.status(200).json({
            success: true,
            message: 'Leadership role assigned successfully'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Remove leadership role assignment
// @route   DELETE /api/leadership-roles/:id
// @access  Private (UNIPRIME)
exports.removeLeadershipRole = async (req, res, next) => {
    try {
        const { id } = req.params; // id is the employeeId
        const { role } = req.body; // optional roleName

        if (role) {
            await LeadershipRole.updateOne(
                { roleName: role },
                { $pull: { assignedFaculty: id } }
            );
        } else {
            // If no specific role is specified, pull employee from all leadership roles
            await LeadershipRole.updateMany(
                { assignedFaculty: id },
                { $pull: { assignedFaculty: id } }
            );
        }

        // Synchronize all employee leadership flags
        await LeadershipRole.syncAllEmployeesLeadership();

        res.status(200).json({
            success: true,
            message: 'Leadership role removed successfully'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all leadership roles
// @route   GET /api/leadership-roles
// @access  Private (UNIPRIME)
exports.getLeadershipRoles = async (req, res, next) => {
    try {
        const assignments = await LeadershipRole.find({})
            .populate('assignedFaculty', 'name institutionId email designation')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: assignments
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get leadership roles for a specific employee
// @route   GET /api/leadership-roles/employee/:employeeId
// @access  Private (UNIPRIME)
exports.getEmployeeLeadershipRoles = async (req, res, next) => {
    try {
        const { employeeId } = req.params;

        const roles = await LeadershipRole.find({ assignedFaculty: employeeId })
            .select('roleName description')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: roles
        });
    } catch (error) {
        next(error);
    }
};
