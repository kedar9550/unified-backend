const fs = require('fs');
const readline = require('readline');
const ReferenceJournal = require('./ReferenceJournal.model');
const escapeRegex = require('../../utils/escapeRegex');

exports.getReferenceJournals = async (req, res, next) => {
    try {
        const { type, search, page = 1, limit = 50 } = req.query;
        const query = {};

        if (type && type !== 'All') {
            query.type = type;
        }

        if (search) {
            const searchRegex = new RegExp(escapeRegex(search), 'i');
            query.$or = [
                { title: searchRegex },
                { publisher: searchRegex }
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [journals, total, statsArray, totalAll] = await Promise.all([
            ReferenceJournal.find(query).sort({ title: 1 }).skip(skip).limit(Number(limit)).lean(),
            ReferenceJournal.countDocuments(query),
            ReferenceJournal.aggregate([
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]),
            ReferenceJournal.countDocuments({})
        ]);

        const types = await ReferenceJournal.distinct('type');

        const stats = {
            total: totalAll,
            byType: statsArray.reduce((acc, curr) => {
                if (curr._id) {
                    acc[curr._id] = curr.count;
                }
                return acc;
            }, {})
        };

        res.status(200).json({
            success: true,
            data: journals,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            },
            types,
            stats
        });
    } catch (error) {
        console.error('Get reference journals error:', error);
        next(error);
    }
};

exports.addReferenceJournal = async (req, res, next) => {
    try {
        const { title, impactFactor, type, publisher, link } = req.body;
        if (!title || !type) {
            return res.status(400).json({ success: false, message: 'Title and list type are required.' });
        }

        const newJournal = await ReferenceJournal.create({
            title: title.trim().toUpperCase(),
            impactFactor: impactFactor || 'NA',
            type,
            publisher: publisher || '',
            link: link || ''
        });

        res.status(201).json({
            success: true,
            message: 'Journal added successfully.',
            data: newJournal
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Journal already exists under this indexing type.' });
        }
        console.error('Add reference journal error:', error);
        next(error);
    }
};

exports.updateReferenceJournal = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, impactFactor, type, publisher, link } = req.body;

        const updatedJournal = await ReferenceJournal.findByIdAndUpdate(
            id,
            { $set: { title: title.trim().toUpperCase(), impactFactor, type, publisher, link } },
            { new: true, runValidators: true }
        );

        if (!updatedJournal) {
            return res.status(404).json({ success: false, message: 'Journal not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Journal updated successfully.',
            data: updatedJournal
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Journal already exists under this indexing type.' });
        }
        console.error('Update reference journal error:', error);
        next(error);
    }
};

exports.deleteReferenceJournal = async (req, res, next) => {
    try {
        const { id } = req.params;
        const deletedJournal = await ReferenceJournal.findByIdAndDelete(id);
        if (!deletedJournal) {
            return res.status(404).json({ success: false, message: 'Journal not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Journal deleted successfully.'
        });
    } catch (error) {
        console.error('Delete reference journal error:', error);
        next(error);
    }
};

exports.bulkUploadReferenceJournals = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
        }

        const { defaultType = 'FT-50' } = req.body;
        const results = [];
        const errors = [];

        // Parse file line-by-line for absolute safety against BOM and separator types
        const fileStream = fs.createReadStream(req.file.path);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let isFirstRow = true;

        for await (let line of rl) {
            // Strip BOM prefix if Excel saved it
            if (isFirstRow && line.startsWith('\ufeff')) {
                line = line.replace(/^\ufeff/, '');
            }

            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Handle comma, tab, or semicolon delimiters
            let parts = [];
            if (trimmedLine.includes('\t')) {
                parts = trimmedLine.split('\t');
            } else if (trimmedLine.includes(';')) {
                parts = trimmedLine.split(';');
            } else {
                parts = trimmedLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            }

            // Remove quotes and leading/trailing whitespace
            parts = parts.map(p => p.replace(/^["']|["']$/g, '').trim());

            const title = parts[0] || '';
            const impactFactor = parts[1] || 'NA';
            const type = parts[2] || defaultType;
            const publisher = parts[3] || '';
            const link = parts[4] || '';

            // Detect and skip headers row if present
            if (isFirstRow) {
                isFirstRow = false;
                const lowerTitle = title.toLowerCase();
                const lowerIF = impactFactor.toLowerCase();
                if (
                    lowerTitle.includes('title') || 
                    lowerTitle.includes('journal') || 
                    lowerTitle === 'name' ||
                    lowerIF.includes('if') ||
                    lowerIF.includes('impact') ||
                    lowerIF.includes('factor')
                ) {
                    continue;
                }
            }

            if (!title) {
                errors.push({ line: trimmedLine, error: 'Missing journal title' });
                continue;
            }

            results.push({
                title: title.trim().toUpperCase(),
                impactFactor,
                type,
                publisher,
                link
            });
        }

        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid journal rows found in CSV.',
                errorCount: errors.length,
                errors
            });
        }

        let insertedCount = 0;
        let skippedDuplicates = 0;

        try {
            const insertResult = await ReferenceJournal.insertMany(results, { ordered: false });
            insertedCount = insertResult.length;
        } catch (bulkError) {
            insertedCount = bulkError.result?.nInserted || 0;
            const writeErrors = bulkError.writeErrors || [];
            skippedDuplicates = writeErrors.filter(e => e.code === 11000).length;
            
            writeErrors.forEach(we => {
                if (we.code !== 11000) {
                    errors.push({ index: we.index, error: we.errmsg });
                }
            });
        }

        res.status(200).json({
            success: true,
            message: `Successfully imported ${insertedCount} journals.`,
            insertedCount,
            skippedDuplicates,
            failureCount: errors.length,
            errors
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('Bulk upload reference journals error:', error);
        next(error);
    }
};
