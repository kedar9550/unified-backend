const Events = require('./Events.model');
const Group = require('../Group/Group.model');
const fs = require('fs');
const path = require('path');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Role = require('../role/role.model');
const Employee = require('../employee/employee.model');

const normalizeCoordinatorItem = (coordinator) => {
    if (!coordinator) return null;
    let parsed = coordinator;
    if (typeof coordinator === 'string') {
        try {
            parsed = JSON.parse(coordinator);
        } catch (err) {
            parsed = null;
        }
    }
    if (!parsed) return null;

    const employeeId = parsed.employeeId || parsed.institutionId || parsed.employeeCode || parsed._id || parsed.id;
    if (!employeeId) return null;

    return {
        employeeId: employeeId.toString(),
        employeeName: parsed.employeeName || parsed.name || '',
        department: parsed.department || parsed.departmentName || '',
        designation: parsed.designation || parsed.title || '',
    };
};

const normalizeCoordinators = (coordinatorsInput) => {
    if (!coordinatorsInput) return [];
    let parsed = coordinatorsInput;
    if (typeof coordinatorsInput === 'string') {
        try {
            parsed = JSON.parse(coordinatorsInput);
        } catch (err) {
            parsed = null;
        }
    }
    if (!parsed) return [];

    if (Array.isArray(parsed)) {
        return parsed.map(normalizeCoordinatorItem).filter(Boolean);
    }

    const normalized = normalizeCoordinatorItem(parsed);
    return normalized ? [normalized] : [];
};

const assignFacultyCoordinatorRole = async (coordinators) => {
    if (!Array.isArray(coordinators) || coordinators.length === 0) return;

    const roleDoc = await Role.findOne({ name: 'FACULTY COORDINATOR', app: 'UNIFIED_SYSTEM' });
    if (!roleDoc) {
        console.warn('FACULTY COORDINATOR role not found in DB. Role not assigned.');
        return;
    }

    for (const coordinator of coordinators) {
        if (!coordinator || !coordinator.employeeId) continue;

        const employee = await Employee.findOne({ institutionId: coordinator.employeeId });
        if (!employee) {
            console.warn(`Employee not found for faculty coordinator ${coordinator.employeeId}`);
            continue;
        }

        await UserAppRole.updateOne(
            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
            { $set: { userModel: 'Employee' } },
            { upsert: true }
        );
    }
};

exports.createEvent = async (req, res, next) => {
    try {
        const {
            groupId,
            eventName,
            price,
            maxTeamSize,
            venue,
            extraTeamSize,
            extraAmountPerHead,
            overview,
            rules,
            conveners,
        } = req.body;

        const bannerImage = req.file;

        if (!groupId || !eventName || !overview || !maxTeamSize || !venue) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Group, Event Name, Venue, Max Team Size, and Overview are required.' });
        }

        const group = await Group.findById(groupId).populate('department', 'name');
        if (!group) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Selected group does not exist.' });
        }

        const parsedRules = Array.isArray(rules) ? rules.filter((rule) => rule && rule.trim()) : [];
        const parsedConveners = typeof conveners === 'string' ? JSON.parse(conveners || '[]') : Array.isArray(conveners) ? conveners : [];
        const parsedFacultyCoordinators = normalizeCoordinators(req.body.facultyCoordinators || req.body.facultyCoordinator);

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(401).json({ message: 'Unauthorized. User ID not found.' });
        }

        let bannerImageUrl;
        if (bannerImage) {
            bannerImageUrl = `/uploads/events/${bannerImage.filename}`;
        }

        const departmentNames = Array.isArray(group.department)
            ? group.department.map((dept) => dept?.name || '').filter(Boolean).join(', ')
            : group.department?.name || '';

        const newEvent = new Events({
            group: group._id,
            department: departmentNames,
            eventName,
            price: Number(price) || 0,
            maxTeamSize: Number(maxTeamSize),
            venue,
            extraTeamSize: Number(extraTeamSize) || 0,
            extraAmountPerHead: Number(extraAmountPerHead) || 0,
            overview,
            rules: parsedRules,
            bannerImage: bannerImageUrl,
            conveners: parsedConveners,
            facultyCoordinator: parsedFacultyCoordinators[0] || {},
            facultyCoordinators: parsedFacultyCoordinators,
            createdBy: userId,
        });

        await newEvent.save();

        if (parsedConveners.length > 0) {
            try {
                const roleDoc = await Role.findOne({ name: 'CONVENER' });
                if (roleDoc) {
                    for (const convener of parsedConveners) {
                        const employee = await Employee.findOne({ institutionId: convener.employeeId });
                        if (employee) {
                            await UserAppRole.updateOne(
                                { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
                                { $set: { userModel: 'Employee' } },
                                { upsert: true }
                            );
                        }
                    }
                } else {
                    console.warn('CONVENER role not found in DB. Roles not assigned.');
                }
            } catch (roleError) {
                console.error('Error assigning roles to conveners:', roleError);
            }
        }

        if (parsedFacultyCoordinators.length > 0) {
            try {
                await assignFacultyCoordinatorRole(parsedFacultyCoordinators);
            } catch (coordRoleError) {
                console.error('Error assigning faculty coordinator role:', coordRoleError);
            }
        }

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            event: newEvent,
        });
    } catch (error) {
        if (req.file) {
            const filePath = path.join(__dirname, '..', '..', 'uploads', 'events', req.file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        console.error('Error creating event:', error);
        next(error);
    }
};

exports.getAllEvents = async (req, res, next) => {
    try {
        const events = await Events.find()
            .populate('group', 'name department')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, events });
    } catch (error) {
        next(error);
    }
};

exports.getEventById = async (req, res, next) => {
    try {
        const event = await Events.findById(req.params.id).populate('group', 'name department');
        if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
        res.status(200).json({ success: true, event });
    } catch (error) {
        next(error);
    }
};

exports.updateEvent = async (req, res, next) => {
    try {
        const {
            groupId,
            eventName,
            price,
            maxTeamSize,
            venue,
            extraTeamSize,
            extraAmountPerHead,
            overview,
            rules,
        } = req.body;

        if (!groupId || !eventName || !overview || !maxTeamSize || !venue) {
            return res.status(400).json({ message: 'Group, Event Name, Venue, Max Team Size, and Overview are required.' });
        }

        const group = await Group.findById(groupId).populate('department', 'name');
        if (!group) {
            return res.status(400).json({ message: 'Selected group does not exist.' });
        }

        const parsedRules = Array.isArray(rules) ? rules.filter((rule) => rule && rule.trim()) : [];
        const parsedFacultyCoordinators = normalizeCoordinators(req.body.facultyCoordinators || req.body.facultyCoordinator);

        const departmentNames = Array.isArray(group.department)
            ? group.department.map((dept) => dept?.name || '').filter(Boolean).join(', ')
            : group.department?.name || '';

        const updatedFields = {
            group: group._id,
            department: departmentNames,
            eventName,
            price: Number(price) || 0,
            maxTeamSize: Number(maxTeamSize),
            venue,
            extraTeamSize: Number(extraTeamSize) || 0,
            extraAmountPerHead: Number(extraAmountPerHead) || 0,
            overview,
            rules: parsedRules,
        };
        if (parsedFacultyCoordinators.length > 0) {
            updatedFields.facultyCoordinator = parsedFacultyCoordinators[0];
            updatedFields.facultyCoordinators = parsedFacultyCoordinators;
        }

        const updatedEvent = await Events.findByIdAndUpdate(
            req.params.id,
            updatedFields,
            { new: true }
        );

        if (!updatedEvent) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        if (parsedFacultyCoordinators.length > 0) {
            try {
                await assignFacultyCoordinatorRole(parsedFacultyCoordinators);
            } catch (coordRoleError) {
                console.error('Error assigning faculty coordinator role:', coordRoleError);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Event updated successfully',
            event: updatedEvent,
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteEvent = async (req, res, next) => {
    try {
        const event = await Events.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        if (event.bannerImage) {
            const bannerPath = path.join(
                __dirname,
                '..',
                '..',
                'uploads',
                'events',
                path.basename(event.bannerImage),
            );
            if (fs.existsSync(bannerPath)) {
                fs.unlinkSync(bannerPath);
            }
        }

        await Events.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, message: 'Event deleted successfully.' });
    } catch (error) {
        next(error);
    }
};
