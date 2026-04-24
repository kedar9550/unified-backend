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
// @route   GET /api/semester-types
const getSemesterTypes = async (req, res) => {
    try {
        const types = await SemesterType.find({ isActive: true });
        res.json({ count: types.length, data: types });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    seedSemesterTypes,
    getSemesterTypes
};
