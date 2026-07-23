const EventAssignment = require('./EventAssignment.model');
const EventGroup = require('./EventGroup.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Role = require('../role/role.model');
const Employee = require('../employee/employee.model');

const getUserInstitutionId = (req) => req.user?.institutionId;

const userHasFest = async (req, festName) => {
    const institutionId = getUserInstitutionId(req);
    if (!institutionId || !festName) return false;

    return EventAssignment.exists({
        assignmentType: 'Fest',
        eventName: festName,
        'assignees.employeeId': institutionId
    });
};

exports.getGroups = async (req, res, next) => {
    try {
        const { festName } = req.query;
        if (!(await userHasFest(req, festName))) {
            return res.status(403).json({ success: false, message: 'Fest is not assigned to you' });
        }

        const groups = await EventGroup.find({
            assignedFestName: festName,
            createdBy: req.user.userId || req.user._id
        }).sort({ createdAt: -1 });

        res.status(200).json({ success: true, groups });
    } catch (error) {
        next(error);
    }
};

exports.createGroup = async (req, res, next) => {
    try {
        const { groupName, status, assignedFestName, majorEventAdmin } = req.body;
        if (!groupName?.trim() || !assignedFestName?.trim() || !majorEventAdmin?.employeeId) {
            return res.status(400).json({ success: false, message: 'Group name, assigned fest name, and major event admin are required' });
        }
        if (!['Active', 'Inactive'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Status must be Active or Inactive' });
        }
        if (!(await userHasFest(req, assignedFestName.trim()))) {
            return res.status(403).json({ success: false, message: 'Fest is not assigned to you' });
        }

        const employee = await Employee.findOne({ institutionId: majorEventAdmin.employeeId });
        if (!employee) {
            return res.status(400).json({ success: false, message: 'Selected major event admin was not found' });
        }

        const roleDoc = await Role.findOne({ name: 'MAJOR EVENT ADMIN', app: 'UNIFIED_SYSTEM' });
        if (!roleDoc) {
            return res.status(500).json({ success: false, message: 'MAJOR EVENT ADMIN role is not configured' });
        }

        const adminDetails = {
            employeeId: employee.institutionId,
            employeeName: employee.name,
            department: employee.department?.name || majorEventAdmin.department || 'N/A',
            designation: employee.designation || majorEventAdmin.designation || 'N/A',
            roleAssigned: 'MAJOR EVENT ADMIN'
        };

        const group = await EventGroup.create({
            groupName: groupName.trim(),
            status,
            assignedFestName: assignedFestName.trim(),
            majorEventAdmin: adminDetails,
            createdBy: req.user.userId || req.user._id
        });

        await UserAppRole.updateOne(
            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
            { $set: { userModel: 'Employee' } },
            { upsert: true }
        );

        res.status(201).json({ success: true, group });
    } catch (error) {
        next(error);
    }
};

const getOwnedGroup = async (req, id) => EventGroup.findOne({
    _id: id,
    createdBy: req.user.userId || req.user._id
});

const validateGroupInput = async (req, res) => {
    const { groupName, status, assignedFestName, majorEventAdmin } = req.body;
    if (!groupName?.trim() || !assignedFestName?.trim() || !majorEventAdmin?.employeeId) {
        res.status(400).json({ success: false, message: 'Group name, assigned fest name, and major event admin are required' });
        return null;
    }
    if (!['Active', 'Inactive'].includes(status)) {
        res.status(400).json({ success: false, message: 'Status must be Active or Inactive' });
        return null;
    }
    if (!(await userHasFest(req, assignedFestName.trim()))) {
        res.status(403).json({ success: false, message: 'Fest is not assigned to you' });
        return null;
    }

    const employee = await Employee.findOne({ institutionId: majorEventAdmin.employeeId });
    if (!employee) {
        res.status(400).json({ success: false, message: 'Selected major event admin was not found' });
        return null;
    }

    return {
        groupName: groupName.trim(),
        status,
        assignedFestName: assignedFestName.trim(),
        majorEventAdmin: {
            employeeId: employee.institutionId,
            employeeName: employee.name,
            department: employee.department?.name || majorEventAdmin.department || 'N/A',
            designation: employee.designation || majorEventAdmin.designation || 'N/A',
            roleAssigned: 'MAJOR EVENT ADMIN'
        }
    };
};

exports.updateGroup = async (req, res, next) => {
    try {
        const group = await getOwnedGroup(req, req.params.id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }

        const values = await validateGroupInput(req, res);
        if (!values) return;

        Object.assign(group, values);
        await group.save();

        const roleDoc = await Role.findOne({ name: 'MAJOR EVENT ADMIN', app: 'UNIFIED_SYSTEM' });
        if (!roleDoc) {
            return res.status(500).json({ success: false, message: 'MAJOR EVENT ADMIN role is not configured' });
        }
        const employee = await Employee.findOne({ institutionId: values.majorEventAdmin.employeeId });
        await UserAppRole.updateOne(
            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
            { $set: { userModel: 'Employee' } },
            { upsert: true }
        );

        res.status(200).json({ success: true, group });
    } catch (error) {
        next(error);
    }
};

exports.deleteGroup = async (req, res, next) => {
    try {
        const group = await getOwnedGroup(req, req.params.id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }

        await group.deleteOne();
        res.status(200).json({ success: true, message: 'Group deleted successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = exports;