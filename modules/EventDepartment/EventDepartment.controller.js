const EventDepartment = require('./EventDepartment.model');

// ─── CREATE ───────────────────────────────────────────────────────────────────
exports.createDepartment = async (req, res, next) => {
    try {
        const { name, status } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Name is required.'
            });
        }

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. User ID not found.' });
        }

        const department = await EventDepartment.create({
            name:      name.trim(),
            status:    status || 'Active',
            createdBy: userId
        });

        return res.status(201).json({
            success: true,
            message: 'Department created successfully.',
            department
        });
    } catch (error) {
        console.error('Error creating department:', error);
        next(error);
    }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────
exports.getAllDepartments = async (req, res, next) => {
    try {
        const departments = await EventDepartment.find().sort({ createdAt: -1 });
        return res.status(200).json({ success: true, departments });
    } catch (error) {
        next(error);
    }
};

// ─── READ ONE ─────────────────────────────────────────────────────────────────
exports.getDepartmentById = async (req, res, next) => {
    try {
        const department = await EventDepartment.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found.' });
        }
        return res.status(200).json({ success: true, department });
    } catch (error) {
        next(error);
    }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateDepartment = async (req, res, next) => {
    try {
        const department = await EventDepartment.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found.' });
        }

        const { name, status } = req.body;

        if (name)    department.name    = name.trim();
        if (status)  department.status  = status;

        await department.save();

        return res.status(200).json({
            success: true,
            message: 'Department updated successfully.',
            department
        });
    } catch (error) {
        console.error('Error updating department:', error);
        next(error);
    }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteDepartment = async (req, res, next) => {
    try {
        const department = await EventDepartment.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found.' });
        }

        await EventDepartment.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: 'Department deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting department:', error);
        next(error);
    }
};
