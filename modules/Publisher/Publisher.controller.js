const Publisher = require('./Publisher.model');

/**
 * @desc    Get all publishers with optional filtering by type
 * @route   GET /api/publishers
 * @access  Public (or Protected depending on auth setup)
 */
exports.getPublishers = async (req, res, next) => {
    try {
        const { type } = req.query;
        let query = {};

        if (type) {
            query.type = type;
        }

        const publishers = await Publisher.find(query).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: publishers.length,
            data: publishers
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Seed publishers (internal use)
 */
exports.seedPublishers = async (publishersData) => {
    try {
        // Clear existing publishers to avoid duplicates or just insert if not exists
        // For seeding, we might want to delete first or use upsert
        await Publisher.deleteMany({});
        await Publisher.insertMany(publishersData);
        console.log('Publishers seeded successfully');
    } catch (error) {
        console.error('Error seeding publishers:', error);
    }
};
