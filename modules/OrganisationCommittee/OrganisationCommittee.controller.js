const OrganisationCommittee = require('./OrganisationCommittee.model');

exports.createCommitteeMember = async (req, res, next) => {
    try {
        const { employee, role, status } = req.body;

        if (!employee || !role) {
            return res.status(400).json({ success: false, message: 'Please provide employee and role' });
        }

        // Check if the employee already has this role
        const existing = await OrganisationCommittee.findOne({ employee, role });
        if (existing) {
            return res.status(400).json({ success: false, message: 'This employee is already assigned to this role' });
        }

        const userId = req.user ? (req.user._id || req.user.userId) : null;

        const member = await OrganisationCommittee.create({
            employee,
            role,
            status,
            createdBy: userId
        });

        // Populate employee details for response
        const populatedMember = await OrganisationCommittee.findById(member._id).populate('employee', 'name employeeName employeeCode email phone department designation institutionId');

        res.status(201).json({
            success: true,
            data: populatedMember
        });
    } catch (error) {
        next(error);
    }
};

exports.getCommitteeMembers = async (req, res, next) => {
    try {
        const { role } = req.query;
        
        let query = {};
        if (role) {
            query.role = role;
        }

        const members = await OrganisationCommittee.find(query)
            .populate('employee', 'name employeeName employeeCode email phone department designation institutionId')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: members.length,
            data: members
        });
    } catch (error) {
        next(error);
    }
};

exports.updateCommitteeMember = async (req, res, next) => {
    try {
        const { status, employee } = req.body;

        let member = await OrganisationCommittee.findById(req.params.id);

        if (!member) {
            return res.status(404).json({ success: false, message: 'Committee member not found' });
        }

        // Check if employee is being changed and if it already exists for this role
        if (employee && employee !== member.employee.toString()) {
            const existing = await OrganisationCommittee.findOne({ employee, role: member.role });
            if (existing) {
                return res.status(400).json({ success: false, message: 'This employee is already assigned to this role' });
            }
        }

        member = await OrganisationCommittee.findByIdAndUpdate(
            req.params.id,
            { status, ...(employee && { employee }) },
            { new: true, runValidators: true }
        ).populate('employee', 'name employeeName employeeCode email phone department designation institutionId');

        res.status(200).json({
            success: true,
            data: member
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteCommitteeMember = async (req, res, next) => {
    try {
        const member = await OrganisationCommittee.findById(req.params.id);

        if (!member) {
            return res.status(404).json({ success: false, message: 'Committee member not found' });
        }

        await member.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        next(error);
    }
};
