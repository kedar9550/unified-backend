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

const assignSchoolCoordinatorRole = async (coordinators) => {
    if (!Array.isArray(coordinators) || coordinators.length === 0) return;

    const roleDoc = await Role.findOne({ name: 'SCHOOL COORDINATOR', app: 'UNIFIED_SYSTEM' });
    if (!roleDoc) {
        console.warn('SCHOOL COORDINATOR role not found in DB. Roles not assigned.');
        return;
    }

    for (const coordinator of coordinators) {
        if (!coordinator || !coordinator.employeeId) continue;
        const employee = await Employee.findOne({ institutionId: coordinator.employeeId });
        if (!employee) {
            console.warn(`Employee not found for school coordinator ${coordinator.employeeId}`);
            continue;
        }

        await UserAppRole.updateOne(
            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
            { $set: { userModel: 'Employee' } },
            { upsert: true }
        );
    }
};

const normalizeCoordinators = (coordinatorsData) => {
    if (!coordinatorsData) return [];
    let parsedArray = coordinatorsData;
    
    if (typeof coordinatorsData === 'string') {
        try {
            parsedArray = JSON.parse(coordinatorsData);
        } catch (err) {
            parsedArray = [];
        }
    }
    
    if (!Array.isArray(parsedArray)) {
        parsedArray = [parsedArray];
    }

    return parsedArray.map(parsed => {
        if (!parsed) return null;
        const employeeId = parsed.institutionId || parsed.employeeId || parsed.employeeCode || parsed._id || parsed.id;
        if (!employeeId) return null;

        return {
            employeeId: employeeId.toString(),
            employeeName: parsed.employeeName || parsed.name || '',
            department: parsed.department || parsed.departmentName || '',
            designation: parsed.designation || parsed.title || '',
        };
    }).filter(Boolean);
};

exports.createEventSchool = async (req, res, next) => {
    const bannerFile = req.files?.banner?.[0] ?? null;

    try {
        const { name, shortName, content, status, coordinators, removeBanner, orderNo } = req.body;
        const normalizedCoordinators = normalizeCoordinators(coordinators);

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
            coordinators: normalizedCoordinators,
            status: status || 'Active',
            orderNo: orderNo ? Number(orderNo) : 0,
            createdBy: userId
        });

        if (normalizedCoordinators.length > 0) {
            await assignSchoolCoordinatorRole(normalizedCoordinators);
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
                                { 'coordinators.employeeId': empId },
                                { 'coordinators.employeeId': String(empId) }
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
        
        let empIds = [];
        eventSchools.forEach(g => {
            if (g.coordinators && Array.isArray(g.coordinators)) {
                g.coordinators.forEach(c => {
                    if (c.employeeId) empIds.push(c.employeeId);
                });
            }
        });
        
        empIds = [...new Set(empIds)]; // unique

        if (empIds.length > 0) {
            const employees = await Employee.find({ institutionId: { $in: empIds } }).select('institutionId phone mobile');
            const empMap = {};
            employees.forEach(emp => {
                empMap[emp.institutionId] = emp.phone || emp.mobile || 'N/A';
            });

            eventSchools.forEach(g => {
                if (g.coordinators && Array.isArray(g.coordinators)) {
                    g.coordinators.forEach(c => {
                        if (c.employeeId) {
                            c.phone = empMap[c.employeeId] || 'N/A';
                        }
                    });
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

        const { name, shortName, content, status, coordinators, removeBanner, orderNo } = req.body;
        const normalizedCoordinators = normalizeCoordinators(coordinators);

        if (name) eventSchool.name = name.trim();
        if (shortName) eventSchool.shortName = shortName.trim();
        if (content) eventSchool.content = content.trim();
        if (status) eventSchool.status = status;
        if (coordinators !== undefined) eventSchool.coordinators = normalizedCoordinators;
        if (orderNo !== undefined) eventSchool.orderNo = Number(orderNo);

        if (bannerFile) { 
            deleteFile(eventSchool.banner); 
            eventSchool.banner = `/uploads/event_schools/${bannerFile.filename}`; 
        } else if (removeBanner === 'true') { 
            deleteFile(eventSchool.banner); 
            eventSchool.banner = null; 
        }

        await eventSchool.save();

        if (normalizedCoordinators.length > 0) {
            await assignSchoolCoordinatorRole(normalizedCoordinators);
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
