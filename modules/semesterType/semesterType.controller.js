const SemesterType = require('./semesterType.model');

// @desc    Seed initial semester types
// @route   POST /api/semester-types/seed
const seedSemesterTypes = async (req, res) => {
    try {
        const types = ['ODD', 'EVEN', 'SUMMER'];
        const results = [];

        for (const name of types) {
            const existing = await SemesterType.findOne({ name });
            if (!existing) {
                const created = await SemesterType.create({ name });
                results.push(created);
            } else {
                results.push(existing);
            }
        }

        res.status(201).json({ message: 'Semester types seeded', data: results });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all semester types
const getSemesterTypes = async (req, res) => {
    try {
        const types = await SemesterType.find();
        res.json({ count: types.length, data: types });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Create a new semester type
const createSemesterType = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });

        const existing = await SemesterType.findOne({ name: name.toUpperCase() });
        if (existing) return res.status(400).json({ message: 'Semester type already exists' });

        const created = await SemesterType.create({ name: name.toUpperCase() });
        res.status(201).json({ success: true, data: created });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Toggle semester type status
const toggleSemesterTypeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const type = await SemesterType.findById(id);
        if (!type) return res.status(404).json({ message: 'Not found' });

        type.isActive = !type.isActive;
        await type.save();
        res.json({ success: true, data: type });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Delete semester type
const deleteSemesterType = async (req, res) => {
    try {
        const { id } = req.params;
        await SemesterType.findByIdAndDelete(id);
        res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    seedSemesterTypes,
    getSemesterTypes,
    createSemesterType,
    toggleSemesterTypeStatus,
    deleteSemesterType
};
