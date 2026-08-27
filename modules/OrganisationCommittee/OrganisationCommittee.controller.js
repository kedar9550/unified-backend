const OrganisationCommittee = require('./OrganisationCommittee.model');
const Studentdata = require('../StudentData/Studentdata.model');

exports.createCommitteeMember = async (req, res, next) => {
    try {
        const { employee, rollNo, role, status, orderNumber } = req.body;

        if (!role) {
            return res.status(400).json({ success: false, message: 'Please provide role' });
        }

        let employeeId = employee;

        if (role === 'Student Coordinator') {
            if (!rollNo) {
                return res.status(400).json({ success: false, message: 'Please provide rollNo for Student Coordinator' });
            }
            const existing = await OrganisationCommittee.findOne({ rollNo: rollNo.toUpperCase(), role });
            if (existing) {
                return res.status(400).json({ success: false, message: 'This student is already assigned to this role' });
            }
        } else {
            if (!employee) {
                return res.status(400).json({ success: false, message: 'Please provide employee for this role' });
            }
            const existing = await OrganisationCommittee.findOne({ employee, role });
            if (existing) {
                return res.status(400).json({ success: false, message: 'This employee is already assigned to this role' });
            }
        }

        const userId = req.user ? (req.user._id || req.user.userId) : null;

        const member = await OrganisationCommittee.create({
            ...(employeeId && { employee: employeeId }),
            ...(rollNo && { rollNo: rollNo.toUpperCase() }),
            role,
            status,
            orderNumber: orderNumber || 0,
            createdBy: userId
        });

        const populatedMember = await OrganisationCommittee.findById(member._id)
            .populate('employee', 'name employeeName employeeCode email phone department designation institutionId');

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

        let members = await OrganisationCommittee.find(query)
            .populate('employee', 'name employeeName employeeCode email phone department designation institutionId')
            .sort({ orderNumber: 1, createdAt: -1 })
            .lean();

        const axios = require('axios');
        
        for (let member of members) {
            if (member.role === 'Student Coordinator' && member.rollNo) {
                try {
                    const response = await axios.get(`https://info.aec.edu.in/adityaapi/api/studentdata/${member.rollNo.toUpperCase()}`);
                    if (response.data && response.data.length > 0) {
                        const studentData = response.data[0];
                        member.studentName = studentData.studentname;
                        member.mobileNumber = studentData.mobilenumber;
                        member.branch = studentData.branch;
                    }
                } catch (e) {
                    console.error("Failed to fetch student from external API", e.message);
                }
            }
        }

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
        const { status, employee, rollNo, orderNumber } = req.body;

        let member = await OrganisationCommittee.findById(req.params.id);

        if (!member) {
            return res.status(404).json({ success: false, message: 'Committee member not found' });
        }

        let updateData = { status };
        if (orderNumber !== undefined) {
            updateData.orderNumber = orderNumber;
        }

        if (member.role === 'Student Coordinator') {
            if (rollNo && rollNo.toUpperCase() !== member.rollNo) {
                const existing = await OrganisationCommittee.findOne({ rollNo: rollNo.toUpperCase(), role: member.role });
                if (existing) {
                    return res.status(400).json({ success: false, message: 'This student is already assigned to this role' });
                }
                updateData.rollNo = rollNo.toUpperCase();
            }
        } else {
            if (employee && employee !== member.employee?.toString()) {
                const existing = await OrganisationCommittee.findOne({ employee, role: member.role });
                if (existing) {
                    return res.status(400).json({ success: false, message: 'This employee is already assigned to this role' });
                }
                updateData.employee = employee;
            }
        }

        member = await OrganisationCommittee.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        )
        .populate('employee', 'name employeeName employeeCode email phone department designation institutionId');

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
