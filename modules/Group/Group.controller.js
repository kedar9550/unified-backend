const Group = require('./Group.model');
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

const assignEventCoordinatorRole = async (coordinator) => {
    if (!coordinator || !coordinator.employeeId) return;

    const roleDoc = await Role.findOne({ name: 'EVENT COORDINATOR', app: 'UNIFIED_SYSTEM' });
    if (!roleDoc) {
        console.warn('EVENT COORDINATOR role not found in DB. Roles not assigned.');
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
exports.createGroup = async (req, res, next) => {
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

        const group = await Group.create({
            name: name.trim(),
            shortName: shortName.trim(),
            content: content.trim(),
            banner: `/uploads/groups/${bannerFile.filename}`,
            coordinator: normalizedCoordinator || {},
            status: status || 'Active',
            createdBy: userId
        });

        if (normalizedCoordinator) {
            await assignEventCoordinatorRole(normalizedCoordinator);
        }

        return res.status(201).json({
            success: true,
            message: 'Group created successfully.',
            group
        });
    } catch (error) {
        cleanupFiles([bannerFile]);
        console.error('Error creating group:', error);
        next(error);
    }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────
exports.getAllGroups = async (req, res, next) => {
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

        const groupsData = await Group.find(filterQuery)
            .sort({ createdAt: -1 });

        // Populate phone numbers from Employee model
        let groups = JSON.parse(JSON.stringify(groupsData));
        const empIds = groups
            .filter(g => g.coordinator && g.coordinator.employeeId)
            .map(g => g.coordinator.employeeId);

        if (empIds.length > 0) {
            const employees = await Employee.find({ institutionId: { $in: empIds } }).select('institutionId phone mobile');
            const empMap = {};
            employees.forEach(emp => {
                empMap[emp.institutionId] = emp.phone || emp.mobile || 'N/A';
            });

            groups.forEach(g => {
                if (g.coordinator && g.coordinator.employeeId) {
                    g.coordinator.phone = empMap[g.coordinator.employeeId] || 'N/A';
                }
            });
        }

        return res.status(200).json({ success: true, groups });
    } catch (error) {
        next(error);
    }
};

// ─── READ ONE ─────────────────────────────────────────────────────────────────
exports.getGroupById = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }
        return res.status(200).json({ success: true, group });
    } catch (error) {
        next(error);
    }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateGroup = async (req, res, next) => {
    const bannerFile = req.files?.banner?.[0] ?? null;

    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            cleanupFiles([bannerFile]);
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        const { name, shortName, content, status, coordinator, removeBanner } = req.body;
        const normalizedCoordinator = normalizeCoordinator(coordinator);

        if (name) group.name = name.trim();
        if (shortName) group.shortName = shortName.trim();
        if (content) group.content = content.trim();
        if (status) group.status = status;
        if (normalizedCoordinator) group.coordinator = normalizedCoordinator;

        // Replace banner on disk if a new one was uploaded
        if (bannerFile) { deleteFile(group.banner); group.banner = `/uploads/groups/${bannerFile.filename}`; } else if (removeBanner === 'true') { deleteFile(group.banner); group.banner = null; }

        await group.save();

        if (normalizedCoordinator) {
            await assignEventCoordinatorRole(normalizedCoordinator);
        }

        return res.status(200).json({
            success: true,
            message: 'Group updated successfully.',
            group
        });
    } catch (error) {
        cleanupFiles([bannerFile]);
        console.error('Error updating group:', error);
        next(error);
    }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteGroup = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        // Remove banner image from disk
        deleteFile(group.banner);

        await Group.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: 'Group deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting group:', error);
        next(error);
    }
};

