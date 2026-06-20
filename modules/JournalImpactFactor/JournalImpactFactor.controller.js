const JournalImpactFactor = require('./JournalImpactFactor.model');
const escapeRegex = require('../../utils/escapeRegex');

exports.getJournalImpactFactors = async (req, res, next) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        const query = {};

        if (search) {
            const searchRegex = new RegExp(escapeRegex(search), 'i');
            query.$or = [
                { journalName: searchRegex },
                { abbreviatedJournal: searchRegex },
                { publisher: searchRegex }
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total, totalAll] = await Promise.all([
            JournalImpactFactor.find(query)
                .sort({ rank: 1, journalName: 1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            JournalImpactFactor.countDocuments(query),
            JournalImpactFactor.countDocuments({})
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
        console.error('Get journal impact factors error:', error);
        next(error);
    }
};

exports.addJournalImpactFactor = async (req, res, next) => {
    try {
        const { rank, journalName, abbreviatedJournal, publisher, jif } = req.body;
        
        if (!journalName || jif === undefined || rank === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Rank, Journal Name, and JIF (Impact Factor) are required.' 
            });
        }

        const newRecord = await JournalImpactFactor.create({
            rank: Number(rank),
            journalName: journalName.trim().toUpperCase(),
            abbreviatedJournal: (abbreviatedJournal || '').trim(),
            publisher: (publisher || '').trim(),
            jif: Number(jif)
        });

        res.status(201).json({
            success: true,
            message: 'Journal impact factor entry created successfully.',
            data: newRecord
        });
    } catch (error) {
        console.error('Add journal impact factor error:', error);
        next(error);
    }
};

exports.updateJournalImpactFactor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rank, journalName, abbreviatedJournal, publisher, jif } = req.body;

        if (!journalName || jif === undefined || rank === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Rank, Journal Name, and JIF (Impact Factor) are required.' 
            });
        }

        const updatedRecord = await JournalImpactFactor.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    rank: Number(rank), 
                    journalName: journalName.trim().toUpperCase(), 
                    abbreviatedJournal: (abbreviatedJournal || '').trim(), 
                    publisher: (publisher || '').trim(), 
                    jif: Number(jif) 
                } 
            },
            { new: true, runValidators: true }
        );

        if (!updatedRecord) {
            return res.status(404).json({ success: false, message: 'Journal impact factor entry not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Journal impact factor updated successfully.',
            data: updatedRecord
        });
    } catch (error) {
        console.error('Update journal impact factor error:', error);
        next(error);
    }
};

exports.deleteJournalImpactFactor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const deletedRecord = await JournalImpactFactor.findByIdAndDelete(id);
        
        if (!deletedRecord) {
            return res.status(404).json({ success: false, message: 'Journal impact factor entry not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Journal impact factor deleted successfully.'
        });
    } catch (error) {
        console.error('Delete journal impact factor error:', error);
        next(error);
    }
};
