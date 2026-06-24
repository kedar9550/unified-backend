const fs = require('fs');
const readline = require('readline');
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

exports.bulkUploadJournalImpactFactors = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
        }

        const results = [];
        const errors = [];

        const fileStream = fs.createReadStream(req.file.path);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let isFirstRow = true;

        for await (let line of rl) {
            if (isFirstRow && line.startsWith('\ufeff')) {
                line = line.replace(/^\ufeff/, '');
            }

            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            let parts = [];
            if (trimmedLine.includes('\t')) {
                parts = trimmedLine.split('\t');
            } else if (trimmedLine.includes(';')) {
                parts = trimmedLine.split(';');
            } else {
                parts = trimmedLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            }

            parts = parts.map(p => p.replace(/^["']|["']$/g, '').trim());

            const rankStr = parts[0] || '';
            const journalName = parts[1] || '';
            const abbreviatedJournal = parts[2] || '';
            const publisher = parts[3] || '';
            const jifStr = parts[4] || '';

            // Detect and skip headers row
            if (isFirstRow) {
                isFirstRow = false;
                const lowerName = journalName.toLowerCase();
                if (
                    lowerName.includes('title') || 
                    lowerName.includes('journal') || 
                    lowerName === 'name' || 
                    rankStr.toLowerCase().includes('rank')
                ) {
                    continue;
                }
            }

            const rank = Number(rankStr);
            const jif = Number(jifStr);

            if (!journalName) {
                errors.push({ line: trimmedLine, error: 'Missing journal name' });
                continue;
            }

            if (isNaN(rank)) {
                errors.push({ line: trimmedLine, error: 'Invalid or missing rank' });
                continue;
            }

            if (isNaN(jif)) {
                errors.push({ line: trimmedLine, error: 'Invalid or missing JIF value' });
                continue;
            }

            results.push({
                rank,
                journalName: journalName.trim().toUpperCase(),
                abbreviatedJournal: abbreviatedJournal.trim(),
                publisher: publisher.trim(),
                jif
            });
        }

        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid journal impact factor rows found in CSV.',
                errorCount: errors.length,
                errors
            });
        }

        let insertedCount = 0;
        let skippedDuplicates = 0;

        try {
            const bulkOps = results.map(item => ({
                updateOne: {
                    filter: { journalName: item.journalName },
                    update: { $set: item },
                    upsert: true
                }
            }));
            const bulkResult = await JournalImpactFactor.bulkWrite(bulkOps, { ordered: false });
            insertedCount = bulkResult.upsertedCount + bulkResult.modifiedCount;
        } catch (bulkError) {
            console.error('Bulk write JIF error:', bulkError);
            return res.status(500).json({ success: false, message: 'Bulk upload failed.', error: bulkError.message });
        }

        res.status(200).json({
            success: true,
            message: `Successfully processed CSV file.`,
            insertedCount: results.length,
            errorCount: errors.length,
            errors
        });
    } catch (error) {
        console.error('Bulk upload JIF error:', error);
        next(error);
    }
};
