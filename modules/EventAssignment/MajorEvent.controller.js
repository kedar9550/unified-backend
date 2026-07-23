const EventGroup = require('./EventGroup.model');
const MajorEvent = require('./MajorEvent.model');
const Employee = require('../employee/employee.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Role = require('../role/role.model');

const getUserId = (req) => req.user?.userId || req.user?._id;
const getInstitutionId = (req) => req.user?.institutionId;

const getAssignedGroups = (req) => EventGroup.find({
    'majorEventAdmin.employeeId': getInstitutionId(req),
    status: 'Active'
}).sort({ groupName: 1 });

exports.getMyGroups = async (req, res, next) => {
    try {
        const groups = await getAssignedGroups(req);
        res.status(200).json({ success: true, groups });
    } catch (error) {
        next(error);
    }
};

exports.getGroupEvents = async (req, res, next) => {
    try {
        const group = await EventGroup.findOne({
            _id: req.params.groupId,
            'majorEventAdmin.employeeId': getInstitutionId(req)
        });
        if (!group) return res.status(404).json({ success: false, message: 'Group not found or not assigned to you' });

        const events = await MajorEvent.find({ group: group._id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, events });
    } catch (error) {
        next(error);
    }
};

exports.createEvent = async (req, res, next) => {
    try {
        const { groupId, eventName, coordinator, status } = req.body;
        if (!groupId || !eventName?.trim() || !coordinator?.employeeId) {
            return res.status(400).json({ success: false, message: 'Group, event name, and coordinator are required' });
        }
        if (!['Active', 'Inactive'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Status must be Active or Inactive' });
        }

        const group = await EventGroup.findOne({
            _id: groupId,
            'majorEventAdmin.employeeId': getInstitutionId(req),
            status: 'Active'
        });
        if (!group) return res.status(403).json({ success: false, message: 'Group is not assigned to you' });

        const employee = await Employee.findOne({ institutionId: coordinator.employeeId });
        if (!employee) return res.status(400).json({ success: false, message: 'Selected coordinator was not found' });

        const roleDoc = await Role.findOne({ name: 'EVENT COORDINATOR', app: 'UNIFIED_SYSTEM' });
        if (!roleDoc) return res.status(500).json({ success: false, message: 'EVENT COORDINATOR role is not configured' });

        const coordinatorDetails = {
            employeeId: employee.institutionId,
            employeeName: employee.name,
            department: employee.department?.name || coordinator.department || 'N/A',
            designation: employee.designation || coordinator.designation || 'N/A',
            roleAssigned: 'EVENT COORDINATOR'
        };

        const event = await MajorEvent.create({
            group: group._id,
            groupName: group.groupName,
            eventName: eventName.trim(),
            coordinator: coordinatorDetails,
            status,
            createdBy: getUserId(req)
        });

        await UserAppRole.updateOne(
            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
            { $set: { userModel: 'Employee' } },
            { upsert: true }
        );

        res.status(201).json({ success: true, event });
    } catch (error) {
        next(error);
    }
};

const getOwnedEvent = async (req, id) => {
    const event = await MajorEvent.findById(id);
    if (!event) return null;

    const group = await EventGroup.findOne({
        _id: event.group,
        'majorEventAdmin.employeeId': getInstitutionId(req),
        status: 'Active'
    });
    return group ? { event, group } : null;
};

const buildEventValues = async (req, res) => {
    const { eventName, coordinator, status } = req.body;
    if (!eventName?.trim() || !coordinator?.employeeId) {
        res.status(400).json({ success: false, message: 'Event name and coordinator are required' });
        return null;
    }
    if (!['Active', 'Inactive'].includes(status)) {
        res.status(400).json({ success: false, message: 'Status must be Active or Inactive' });
        return null;
    }

    const employee = await Employee.findOne({ institutionId: coordinator.employeeId });
    if (!employee) {
        res.status(400).json({ success: false, message: 'Selected coordinator was not found' });
        return null;
    }

    return {
        eventName: eventName.trim(),
        status,
        coordinator: {
            employeeId: employee.institutionId,
            employeeName: employee.name,
            department: employee.department?.name || coordinator.department || 'N/A',
            designation: employee.designation || coordinator.designation || 'N/A',
            roleAssigned: 'EVENT COORDINATOR'
        },
        employee
    };
};

exports.updateEvent = async (req, res, next) => {
    try {
        const owned = await getOwnedEvent(req, req.params.id);
        if (!owned) return res.status(404).json({ success: false, message: 'Event not found or not assigned to you' });

        const values = await buildEventValues(req, res);
        if (!values) return;

        owned.event.eventName = values.eventName;
        owned.event.status = values.status;
        owned.event.coordinator = values.coordinator;
        await owned.event.save();

        const roleDoc = await Role.findOne({ name: 'EVENT COORDINATOR', app: 'UNIFIED_SYSTEM' });
        if (!roleDoc) return res.status(500).json({ success: false, message: 'EVENT COORDINATOR role is not configured' });

        await UserAppRole.updateOne(
            { userId: values.employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
            { $set: { userModel: 'Employee' } },
            { upsert: true }
        );

        res.status(200).json({ success: true, event: owned.event });
    } catch (error) {
        next(error);
    }
};

exports.deleteEvent = async (req, res, next) => {
    try {
        const owned = await getOwnedEvent(req, req.params.id);
        if (!owned) return res.status(404).json({ success: false, message: 'Event not found or not assigned to you' });

        await owned.event.deleteOne();
        res.status(200).json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = exports;