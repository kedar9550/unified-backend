const EventSchool = require('./EventSchool.model');
const fs = require('fs');
const path = require('path');
const Role = require('../role/role.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Employee = require('../employee/employee.model');

const deleteFile = (filePath) => {
    if (!filePath) return;
    const absPath = path.join(__dirname, '..', '..', filePath);
    if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
    }
};

// ─── Helper: clean up uploaded files on error ─────────────────────────────────
const cleanupFiles = (files = []) => {
    files.forEach((file) => {
        if (file) {
            const filePath = path.join(file.destination, file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    });
};

const assignSchoolCoordinatorRole = async (coordinator) => {
    if (!coordinator || !coordinator.employeeId) return;

    const roleDoc = await Role.findOne({ name: 'SCHOOL COORDINATOR', app: 'UNIFIED_SYSTEM' });
    if (!roleDoc) {
        console.warn('SCHOOL COORDINATOR role not found in DB. Roles not assigned.');
        return;
    }

    const employee = await Employee.findOne({ institutionId: coordinator.employeeId });
    if (!employee) {
        console.warn(`Employee not found for event coordinator ${coordinator.employeeId}`);
        return;
    }

    await UserAppRole.updateOne(
        { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
        { $set: { userModel: 'Employee' } },
        { upsert: true }
    );
};

const normalizeCoordinator = (coordinator) => {
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

    const employeeId = parsed.institutionId || parsed.employeeId || parsed.employeeCode || parsed._id || parsed.id;
    if (!employeeId) return null;

    return {
        employeeId: employeeId.toString(),
        employeeName: parsed.employeeName || parsed.name || '',
        department: parsed.department || parsed.departmentName || '',
        designation: parsed.designation || parsed.title || '',
    };
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
exports.createEventSchool = async (req, res, next) => {
    const bannerFile = req.files?.banner?.[0] ?? null;

    try {
        const { name, shortName, content, status, coordinator, removeBanner } = req.body;
        const normalizedCoordinator = normalizeCoordinator(coordinator);

        if (!name || !shortName || !content || !bannerFile) {
            cleanupFiles([bannerFile]);
            return res.status(400).json({
                success: false,
                message: 'Name, Short Name, Content, and Banner are required.'
            });
        }

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
            cleanupFiles([bannerFile]);
            return res.status(401).json({ success: false, message: 'Unauthorized. User ID not found.' });
        }

        const event_school = await EventSchool.create({
            name: name.trim(),
            shortName: shortName.trim(),
            content: content.trim(),
            banner: `/uploads/event_schools/${bannerFile.filename}`,
            coordinator: normalizedCoordinator || {},
            status: status || 'Active',
            createdBy: userId
        });

        if (normalizedCoordinator) {
            await assignSchoolCoordinatorRole(normalizedCoordinator);
        }

        return res.status(201).json({
            success: true,
            message: 'EventSchool created successfully.',
            event_school
        });
    } catch (error) {
        cleanupFiles([bannerFile]);
        console.error('Error creating event_school:', error);
        next(error);
    }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────
exports.getAllEventSchools = async (req, res, next) => {
    try {
        let filterQuery = {};
        const activeRole = req.headers['active-role'];

        if (activeRole === 'SCHOOL_COORDINATOR') {
            const jwt = require('jsonwebtoken');
            const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;

            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    const empId = decoded.institutionId;

                    if (empId) {
                        filterQuery = { 'coordinator.employeeId': empId };
                    }
                } catch (err) {
                    console.error('Error decoding token for SCHOOL_COORDINATOR filter', err);
                }
            }
        }

        const event_schoolsData = await EventSchool.find(filterQuery)
            .sort({ createdAt: -1 });

        // Populate phone numbers from Employee model
        let event_schools = JSON.parse(JSON.stringify(event_schoolsData));
        const empIds = event_schools
            .filter(g => g.coordinator && g.coordinator.employeeId)
            .map(g => g.coordinator.employeeId);

        if (empIds.length > 0) {
            const employees = await Employee.find({ institutionId: { $in: empIds } }).select('institutionId phone mobile');
            const empMap = {};
            employees.forEach(emp => {
                empMap[emp.institutionId] = emp.phone || emp.mobile || 'N/A';
            });

            event_schools.forEach(g => {
                if (g.coordinator && g.coordinator.employeeId) {
                    g.coordinator.phone = empMap[g.coordinator.employeeId] || 'N/A';
                }
            });
        }

        return res.status(200).json({ success: true, event_schools });
    } catch (error) {
        next(error);
    }
};

// ─── READ ONE ─────────────────────────────────────────────────────────────────
exports.getEventSchoolById = async (req, res, next) => {
    try {
        const event_school = await EventSchool.findById(req.params.id);
        if (!event_school) {
            return res.status(404).json({ success: false, message: 'Event School not found.' });
        }
        return res.status(200).json({ success: true, event_school });
    } catch (error) {
        next(error);
    }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateEventSchool = async (req, res, next) => {
    const bannerFile = req.files?.banner?.[0] ?? null;

    try {
        const event_school = await EventSchool.findById(req.params.id);
        if (!event_school) {
            cleanupFiles([bannerFile]);
            return res.status(404).json({ success: false, message: 'Event School not found.' });
        }

        const { name, shortName, content, status, coordinator, removeBanner } = req.body;
        const normalizedCoordinator = normalizeCoordinator(coordinator);

        if (name) event_school.name = name.trim();
        if (shortName) event_school.shortName = shortName.trim();
        if (content) event_school.content = content.trim();
        if (status) event_school.status = status;
        if (normalizedCoordinator) event_school.coordinator = normalizedCoordinator;

        // Replace banner on disk if a new one was uploaded
        if (bannerFile) { deleteFile(event_school.banner); event_school.banner = `/uploads/event_schools/${bannerFile.filename}`; } else if (removeBanner === 'true') { deleteFile(event_school.banner); event_school.banner = null; }

        await event_school.save();

        if (normalizedCoordinator) {
            await assignSchoolCoordinatorRole(normalizedCoordinator);
        }

        return res.status(200).json({
            success: true,
            message: 'EventSchool updated successfully.',
            event_school
        });
    } catch (error) {
        cleanupFiles([bannerFile]);
        console.error('Error updating event_school:', error);
        next(error);
    }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteEventSchool = async (req, res, next) => {
    try {
        const event_school = await EventSchool.findById(req.params.id);
        if (!event_school) {
            return res.status(404).json({ success: false, message: 'Event School not found.' });
        }

        // Remove banner image from disk
        deleteFile(event_school.banner);

        await EventSchool.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: 'EventSchool deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting event_school:', error);
        next(error);
    }
};

