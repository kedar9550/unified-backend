const EventAssignment = require('./EventAssignment.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Role = require('../role/role.model');
const Employee = require('../employee/employee.model');

exports.createAssignment = async (req, res, next) => {
    try {
        const { assignmentType, eventName, club, assignees } = req.body;

        if (!assignmentType || !assignees) {
            return res.status(400).json({ message: 'Assignment Type and Assignees are required' });
        }

        if (assignmentType === 'Club' && !club) {
            return res.status(400).json({ message: 'Club is required for Club assignment' });
        }

        if ((assignmentType === 'Fest' || assignmentType === 'Other Event') && !eventName) {
            return res.status(400).json({ message: 'Event Name is required' });
        }

        let parsedAssignees = [];
        try {
            parsedAssignees = typeof assignees === 'string' ? JSON.parse(assignees) : assignees;
        } catch (error) {
            return res.status(400).json({ message: 'Invalid assignees format' });
        }

        if (!Array.isArray(parsedAssignees) || parsedAssignees.length === 0) {
            return res.status(400).json({ message: 'At least one assignee is required' });
        }

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized. User ID not found.' });
        }

        // Determine which role name to assign based on the type
        let targetRoleName = '';
        if (assignmentType === 'Fest') {
            targetRoleName = 'CONVENER';
        } else if (assignmentType === 'Club') {
            targetRoleName = 'CLUB COORDINATOR';
        } else if (assignmentType === 'Other Event') {
            targetRoleName = 'EVENT COORDINATOR';
        }

        // Assign the role in our AssigneeSchema explicitly for tracking
        const assigneesWithRole = parsedAssignees.map(a => ({
            ...a,
            roleAssigned: targetRoleName
        }));

        const newAssignment = new EventAssignment({
            assignmentType,
            eventName: assignmentType === 'Club' ? undefined : eventName,
            club: assignmentType === 'Club' ? club : undefined,
            assignees: assigneesWithRole,
            createdBy: userId
        });

        await newAssignment.save();

        // Assign Role globally in UserAppRole
        try {
            const roleDoc = await Role.findOne({ name: targetRoleName });
            if (roleDoc) {
                for (const assignee of parsedAssignees) {
                    const employee = await Employee.findOne({ institutionId: assignee.employeeId });
                    if (employee) {
                        await UserAppRole.updateOne(
                            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
                            { $set: { userModel: 'Employee' } },
                            { upsert: true }
                        );
                    }
                }
            } else {
                console.warn(`Role ${targetRoleName} not found in DB. Roles not assigned.`);
            }
        } catch (roleError) {
            console.error('Error assigning roles:', roleError);
        }

        res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            assignment: newAssignment
        });
    } catch (error) {
        console.error('Error creating assignment:', error);
        next(error);
    }
};

exports.getAllAssignments = async (req, res, next) => {
    try {
        const assignments = await EventAssignment.find()
            .populate('club', 'name logo status')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, assignments });
    } catch (error) {
        next(error);
    }
};

exports.getMyFestAssignments = async (req, res, next) => {
    try {
        if (!req.user?.institutionId) {
            return res.status(400).json({ success: false, message: 'User institution ID not found' });
        }

        const assignments = await EventAssignment.find({
            assignmentType: 'Fest',
            'assignees.employeeId': req.user.institutionId
        }).select('eventName assignees').sort({ eventName: 1 });

        res.status(200).json({ success: true, assignments });
    } catch (error) {
        next(error);
    }
};

exports.updateAssignment = async (req, res, next) => {
    try {
        const { assignmentType, eventName, club, assignees } = req.body;
        const assignment = await EventAssignment.findById(req.params.id);

        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }

        if (!assignmentType || !assignees) {
            return res.status(400).json({ message: 'Assignment Type and Assignees are required' });
        }

        if (assignmentType === 'Club' && !club) {
            return res.status(400).json({ message: 'Club is required for Club assignment' });
        }

        if ((assignmentType === 'Fest' || assignmentType === 'Other Event') && !eventName) {
            return res.status(400).json({ message: 'Event Name is required' });
        }

        let parsedAssignees = [];
        try {
            parsedAssignees = typeof assignees === 'string' ? JSON.parse(assignees) : assignees;
        } catch (error) {
            return res.status(400).json({ message: 'Invalid assignees format' });
        }

        if (!Array.isArray(parsedAssignees) || parsedAssignees.length === 0) {
            return res.status(400).json({ message: 'At least one assignee is required' });
        }

        let targetRoleName = '';
        if (assignmentType === 'Fest') {
            targetRoleName = 'CONVENER';
        } else if (assignmentType === 'Club') {
            targetRoleName = 'CLUB COORDINATOR';
        } else if (assignmentType === 'Other Event') {
            targetRoleName = 'EVENT COORDINATOR';
        }

        const assigneesWithRole = parsedAssignees.map(a => ({
            ...a,
            roleAssigned: targetRoleName
        }));

        assignment.assignmentType = assignmentType;
        assignment.eventName = assignmentType === 'Club' ? undefined : eventName;
        assignment.club = assignmentType === 'Club' ? club : undefined;
        assignment.assignees = assigneesWithRole;

        await assignment.save();

        try {
            const roleDoc = await Role.findOne({ name: targetRoleName });
            if (roleDoc) {
                for (const assignee of parsedAssignees) {
                    const employee = await Employee.findOne({ institutionId: assignee.employeeId });
                    if (employee) {
                        await UserAppRole.updateOne(
                            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
                            { $set: { userModel: 'Employee' } },
                            { upsert: true }
                        );
                    }
                }
            }
        } catch (roleError) {
            console.error('Error assigning roles on update:', roleError);
        }

        res.status(200).json({
            success: true,
            message: 'Assignment updated successfully',
            assignment
        });
    } catch (error) {
        console.error('Error updating assignment:', error);
        next(error);
    }
};

exports.deleteAssignment = async (req, res, next) => {
    try {
        const assignment = await EventAssignment.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        await EventAssignment.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Assignment deleted successfully' });
    } catch (error) {
        next(error);
    }
};
