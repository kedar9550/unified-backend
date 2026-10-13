const CentralEventOrganisationCommittee = require('./CentralEventOrganisationCommittee.model');
const CentralEventType = require('../EventTypes/CentralEventType.model');

exports.createCommitteeMember = async (req, res, next) => {
  try {
    const { employee, rollNo, role, status, orderNumber } = req.body;
    let event_type = (req.body.event_type || req.body.eventType || 'VEDA').toUpperCase().trim();
    let typeId = req.body.typeId;

    if (!role) {
      return res.status(400).json({ success: false, message: 'Please provide role' });
    }

    if (!typeId) {
      const typeDoc = await CentralEventType.findOne({ code: event_type });
      if (typeDoc) {
        typeId = typeDoc._id;
      }
    }

    let employeeId = employee;

    if (role === 'Student Coordinator') {
      if (!rollNo) {
        return res.status(400).json({ success: false, message: 'Please provide rollNo for Student Coordinator' });
      }
      const existing = await CentralEventOrganisationCommittee.findOne({
        rollNo: rollNo.toUpperCase(),
        role,
        event_type
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `This student is already assigned to ${role} for ${event_type}`
        });
      }
    } else {
      if (!employee) {
        return res.status(400).json({ success: false, message: 'Please provide employee for this role' });
      }
      const existing = await CentralEventOrganisationCommittee.findOne({
        employee,
        role,
        event_type
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `This employee is already assigned to ${role} for ${event_type}`
        });
      }
    }

    const userId = req.user ? (req.user._id || req.user.userId) : null;

    const member = await CentralEventOrganisationCommittee.create({
      event_type,
      ...(typeId && { typeId }),
      ...(employeeId && { employee: employeeId }),
      ...(rollNo && { rollNo: rollNo.toUpperCase() }),
      role,
      status: status || 'Active',
      orderNumber: orderNumber || 0,
      createdBy: userId
    });

    const populatedMember = await CentralEventOrganisationCommittee.findById(member._id)
      .populate('employee', 'name employeeName employeeCode email phone department designation institutionId')
      .populate('typeId', 'code name levelGroup');

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
    const event_type = req.query.event_type || req.query.eventType;

    let query = {};
    if (role) {
      query.role = role;
    }
    if (event_type && event_type !== 'ALL') {
      query.event_type = event_type.toUpperCase().trim();
    }

    let members = await CentralEventOrganisationCommittee.find(query)
      .populate('employee', 'name employeeName employeeCode email phone department designation institutionId')
      .populate('typeId', 'code name levelGroup')
      .sort({ orderNumber: 1, createdAt: -1 })
      .lean();

    const { fetchStudentFromEcap } = require('../../../utils/ecapService');

    for (let member of members) {
      if (member.role === 'Student Coordinator' && member.rollNo) {
        try {
          const studentData = await fetchStudentFromEcap(member.rollNo);
          if (studentData) {
            member.studentName = studentData.studentname || studentData.studentName || studentData.name;
            member.mobileNumber = studentData.mobilenumber || studentData.mobileNumber || studentData.phone;
            member.branch = studentData.branch || studentData.department;
          }
        } catch (e) {
          // Fallback if ECAP API is unavailable
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
    let event_type = req.body.event_type || req.body.eventType;

    let member = await CentralEventOrganisationCommittee.findById(req.params.id);

    if (!member) {
      return res.status(404).json({ success: false, message: 'Committee member not found' });
    }

    let targetEventType = (event_type || member.event_type || 'VEDA').toUpperCase().trim();

    let updateData = { status };
    if (orderNumber !== undefined) {
      updateData.orderNumber = orderNumber;
    }
    if (event_type) {
      updateData.event_type = targetEventType;
      const typeDoc = await CentralEventType.findOne({ code: targetEventType });
      if (typeDoc) {
        updateData.typeId = typeDoc._id;
      }
    }

    if (member.role === 'Student Coordinator') {
      const targetRoll = (rollNo || member.rollNo).toUpperCase();
      if (rollNo && targetRoll !== member.rollNo) {
        const existing = await CentralEventOrganisationCommittee.findOne({
          rollNo: targetRoll,
          role: member.role,
          event_type: targetEventType,
          _id: { $ne: member._id }
        });
        if (existing) {
          return res.status(400).json({
            success: false,
            message: `This student is already assigned to this role in ${targetEventType}`
          });
        }
        updateData.rollNo = targetRoll;
      }
    } else {
      const targetEmp = employee || member.employee?.toString();
      if (employee && targetEmp !== member.employee?.toString()) {
        const existing = await CentralEventOrganisationCommittee.findOne({
          employee: targetEmp,
          role: member.role,
          event_type: targetEventType,
          _id: { $ne: member._id }
        });
        if (existing) {
          return res.status(400).json({
            success: false,
            message: `This employee is already assigned to this role in ${targetEventType}`
          });
        }
        updateData.employee = targetEmp;
      }
    }

    member = await CentralEventOrganisationCommittee.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('employee', 'name employeeName employeeCode email phone department designation institutionId')
      .populate('typeId', 'code name levelGroup');

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
    const member = await CentralEventOrganisationCommittee.findById(req.params.id);

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
