const Group = require('./Group.model');
const fs = require('fs');
const path = require('path');
const Role = require('../role/role.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Employee = require('../employee/employee.model');

// ─── Helper: delete a file from disk safely ───────────────────────────────────
const deleteFile = (filePath) => {
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
    const logoFile   = req.files?.logo?.[0]   ?? null;
    const bannerFile = req.files?.banner?.[0] ?? null;

    try {
        const { name, department, content, status, eventCoordinator } = req.body;
        const normalizedCoordinator = normalizeCoordinator(eventCoordinator);

        let departments = department;
        if (typeof departments === 'string') {
            try {
                departments = JSON.parse(department);
            } catch (err) {
                departments = department ? [department] : [];
            }
        }
        if (!Array.isArray(departments)) {
            departments = departments ? [departments] : [];
        }

        if (!name || !departments.length || !content || !logoFile || !bannerFile) {
            cleanupFiles([logoFile, bannerFile]);
            return res.status(400).json({
                success: false,
                message: 'Name, Department, Content, Logo, and Banner are all required.'
            });
        }

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
            cleanupFiles([logoFile, bannerFile]);
            return res.status(401).json({ success: false, message: 'Unauthorized. User ID not found.' });
        }

        const group = await Group.create({
            name:      name.trim(),
            department: departments,
            content:   content.trim(),
            logo:      `/uploads/groups/${logoFile.filename}`,
            banner:    `/uploads/groups/${bannerFile.filename}`,
            eventCoordinator: normalizedCoordinator || {},
            status:    status || 'Active',
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
        cleanupFiles([logoFile, bannerFile]);
        console.error('Error creating group:', error);
        next(error);
    }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────
exports.getAllGroups = async (req, res, next) => {
    try {
        const groups = await Group.find()
            .populate('department', 'name status')
            .sort({ createdAt: -1 });
        return res.status(200).json({ success: true, groups });
    } catch (error) {
        next(error);
    }
};

// ─── READ ONE ─────────────────────────────────────────────────────────────────
exports.getGroupById = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id).populate('department', 'name status');
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
    const logoFile   = req.files?.logo?.[0]   ?? null;
    const bannerFile = req.files?.banner?.[0] ?? null;

    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            cleanupFiles([logoFile, bannerFile]);
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        const { name, department, content, status, eventCoordinator } = req.body;
        const normalizedCoordinator = normalizeCoordinator(eventCoordinator);

        let departments = department;
        if (department) {
            if (typeof departments === 'string') {
                try {
                    departments = JSON.parse(department);
                } catch (err) {
                    departments = [department];
                }
            }
            if (!Array.isArray(departments)) {
                departments = departments ? [departments] : [];
            }
        }

        if (name)       group.name       = name.trim();
        if (department) group.department = departments;
        if (content)    group.content    = content.trim();
        if (status)     group.status     = status;
        if (normalizedCoordinator) group.eventCoordinator = normalizedCoordinator;

        // Replace logo on disk if a new one was uploaded
        if (logoFile) {
            deleteFile(group.logo);
            group.logo = `/uploads/groups/${logoFile.filename}`;
        }

        // Replace banner on disk if a new one was uploaded
        if (bannerFile) {
            deleteFile(group.banner);
            group.banner = `/uploads/groups/${bannerFile.filename}`;
        }

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
        cleanupFiles([logoFile, bannerFile]);
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

        // Remove both images from disk
        deleteFile(group.logo);
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
