const JournalMaster = require('./JournalMaster.model');
const escapeRegex = require('../../utils/escapeRegex');

exports.getJournalMasters = async (req, res, next) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        const query = {};

        if (search) {
            const searchRegex = new RegExp(escapeRegex(search), 'i');
            query.$or = [
                { journalTitle: searchRegex },
                { type: searchRegex }
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total, totalAll] = await Promise.all([
            JournalMaster.find(query)
                .sort({ journalTitle: 1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            JournalMaster.countDocuments(query),
            JournalMaster.countDocuments({})
        ]);

        res.status(200).json({
            success: true,
            data: records,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            },
            stats: {
                total: totalAll
            }
        });
    } catch (error) {
        console.error('Get journal masters error:', error);
        next(error);
    }
};

exports.addJournalMaster = async (req, res, next) => {
    try {
        const { journalTitle, impactFactor, type } = req.body;
        
        if (!journalTitle || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Journal Title and Type are required.' 
            });
        }

        const newRecord = await JournalMaster.create({
            journalTitle: journalTitle.trim().toUpperCase(),
            impactFactor: impactFactor !== undefined ? Number(impactFactor) : null,
            type: type.trim()
        });

        res.status(201).json({
            success: true,
            message: 'Journal master entry created successfully.',
            data: newRecord
        });
    } catch (error) {
        console.error('Add journal master error:', error);
        next(error);
    }
};

exports.updateJournalMaster = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { journalTitle, impactFactor, type } = req.body;

        if (!journalTitle || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Journal Title and Type are required.' 
            });
        }

        const updatedRecord = await JournalMaster.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    journalTitle: journalTitle.trim().toUpperCase(), 
                    impactFactor: impactFactor !== undefined ? Number(impactFactor) : null, 
                    type: type.trim() 
                } 
            },
            { new: true, runValidators: true }
        );

        if (!updatedRecord) {
            return res.status(404).json({ success: false, message: 'Journal master entry not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Journal master updated successfully.',
            data: updatedRecord
        });
    } catch (error) {
        console.error('Update journal master error:', error);
        next(error);
    }
};

exports.deleteJournalMaster = async (req, res, next) => {
    try {
        const { id } = req.params;
        const deletedRecord = await JournalMaster.findByIdAndDelete(id);
        
        if (!deletedRecord) {
            return res.status(404).json({ success: false, message: 'Journal master entry not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Journal master deleted successfully.'
        });
    } catch (error) {
        console.error('Delete journal master error:', error);
        next(error);
    }
};
