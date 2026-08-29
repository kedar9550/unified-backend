const EventSchools = require('./EventSchools.model');
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
        console.warn(`Employee not found for school coordinator ${coordinator.employeeId}`);
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

exports.createEventSchool = async (req, res, next) => {
    const bannerFile = req.files?.banner?.[0] ?? null;

    try {
        const { name, shortName, content, status, coordinator, removeBanner, orderNo } = req.body;
        const normalizedCoordinator = normalizeCoordinator(coordinator);

        if (!name || !shortName || !content) {
            cleanupFiles([bannerFile]);
            return res.status(400).json({
                success: false,
                message: 'Name, Short Name, and Content are required.'
            });
        }

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
            cleanupFiles([bannerFile]);
            return res.status(401).json({ success: false, message: 'Unauthorized. User ID not found.' });
        }

        const eventSchool = await EventSchools.create({
            name: name.trim(),
            shortName: shortName.trim(),
            content: content.trim(),
            banner: bannerFile ? `/uploads/event_schools/${bannerFile.filename}` : null,
            coordinator: normalizedCoordinator || {},
            status: status || 'Active',
            orderNo: orderNo ? Number(orderNo) : 0,
            createdBy: userId
        });

        if (normalizedCoordinator) {
            await assignSchoolCoordinatorRole(normalizedCoordinator);
        }

        return res.status(201).json({
            success: true,
            message: 'Event School created successfully.',
            eventSchool
        });
    } catch (error) {
        cleanupFiles([bannerFile]);
        console.error('Error creating event school:', error);
        next(error);
    }
};

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
                        filterQuery = { 
                            $or: [
                                { 'coordinator.employeeId': empId },
                                { 'coordinator.employeeId': String(empId) }
                            ]
                        };
                    }
                } catch (err) {
                    console.error('Error decoding token for SCHOOL_COORDINATOR filter', err);
                }
            }
        }

        const eventSchoolsData = await EventSchools.find(filterQuery)
            .sort({ orderNo: 1, createdAt: -1 });

        let eventSchools = JSON.parse(JSON.stringify(eventSchoolsData));
        const empIds = eventSchools
            .filter(g => g.coordinator && g.coordinator.employeeId)
            .map(g => g.coordinator.employeeId);

        if (empIds.length > 0) {
            const employees = await Employee.find({ institutionId: { $in: empIds } }).select('institutionId phone mobile');
            const empMap = {};
            employees.forEach(emp => {
                empMap[emp.institutionId] = emp.phone || emp.mobile || 'N/A';
            });

            eventSchools.forEach(g => {
                if (g.coordinator && g.coordinator.employeeId) {
                    g.coordinator.phone = empMap[g.coordinator.employeeId] || 'N/A';
                }
            });
        }

        return res.status(200).json({ success: true, eventSchools });
    } catch (error) {
        next(error);
    }
};

exports.getEventSchoolById = async (req, res, next) => {
    try {
        const eventSchool = await EventSchools.findById(req.params.id);
        if (!eventSchool) {
            return res.status(404).json({ success: false, message: 'Event School not found.' });
        }
        return res.status(200).json({ success: true, eventSchool });
    } catch (error) {
        next(error);
    }
};

exports.updateEventSchool = async (req, res, next) => {
    const bannerFile = req.files?.banner?.[0] ?? null;

    try {
        const eventSchool = await EventSchools.findById(req.params.id);
        if (!eventSchool) {
            cleanupFiles([bannerFile]);
            return res.status(404).json({ success: false, message: 'Event School not found.' });
        }

        const { name, shortName, content, status, coordinator, removeBanner, orderNo } = req.body;
        const normalizedCoordinator = normalizeCoordinator(coordinator);

        if (name) eventSchool.name = name.trim();
        if (shortName) eventSchool.shortName = shortName.trim();
        if (content) eventSchool.content = content.trim();
        if (status) eventSchool.status = status;
        if (normalizedCoordinator) eventSchool.coordinator = normalizedCoordinator;
        if (orderNo !== undefined) eventSchool.orderNo = Number(orderNo);

        if (bannerFile) { 
            deleteFile(eventSchool.banner); 
            eventSchool.banner = `/uploads/event_schools/${bannerFile.filename}`; 
        } else if (removeBanner === 'true') { 
            deleteFile(eventSchool.banner); 
            eventSchool.banner = null; 
        }

        await eventSchool.save();

        if (normalizedCoordinator) {
            await assignSchoolCoordinatorRole(normalizedCoordinator);
        }

        return res.status(200).json({
            success: true,
            message: 'Event School updated successfully.',
            eventSchool
        });
    } catch (error) {
        cleanupFiles([bannerFile]);
        console.error('Error updating event school:', error);
        next(error);
    }
};

exports.deleteEventSchool = async (req, res, next) => {
    try {
        const eventSchool = await EventSchools.findById(req.params.id);
        if (!eventSchool) {
            return res.status(404).json({ success: false, message: 'Event School not found.' });
        }

        deleteFile(eventSchool.banner);

        await EventSchools.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: 'Event School deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting event school:', error);
        next(error);
    }
};
