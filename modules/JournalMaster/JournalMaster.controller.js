const fs = require('fs');
const readline = require('readline');
const JournalMaster = require('./JournalMaster.model');
const escapeRegex = require('../../utils/escapeRegex');

const STANDARD_TYPES = ['IEEE', 'ASME', 'ASCE', 'ACM', 'FT-50', 'Scopus Top 10%'];

exports.getJournalMasters = async (req, res, next) => {
    try {
        const { type, search, page = 1, limit = 50 } = req.query;
        const query = {};

        if (type && type !== 'All') {
            if (type === 'FT50' || type === 'FT-50') {
                query.type = { $in: ['FT-50', 'FT50'] };
            } else {
                query.type = type;
            }
        }

        if (search) {
            const searchRegex = new RegExp(escapeRegex(search), 'i');
            query.$or = [
                { journalTitle: searchRegex },
                { type: searchRegex },
                { issn: searchRegex },
                { eissn: searchRegex }
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total, statsArray, totalAll] = await Promise.all([
            JournalMaster.find(query)
                .sort({ journalTitle: 1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            JournalMaster.countDocuments(query),
            JournalMaster.aggregate([
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]),
            JournalMaster.countDocuments({})
        ]);

        const rawTypes = await JournalMaster.distinct('type');
        const types = Array.from(new Set([...STANDARD_TYPES, ...rawTypes.filter(Boolean)]));

        const stats = {
            total: totalAll,
            byType: statsArray.reduce((acc, curr) => {
                if (curr._id) {
                    acc[curr._id] = curr.count;
                }
                return acc;
            }, {})
        };

        const mappedRecords = records.map(j => ({
            ...j,
            title: j.journalTitle || j.title || '',
            journalTitle: j.journalTitle || j.title || '',
            issn: j.issn || '',
            eissn: j.eissn || '',
            impactFactor: (j.impactFactor !== null && j.impactFactor !== undefined) ? String(j.impactFactor) : 'NA',
            type: j.type
        }));

        res.status(200).json({
            success: true,
            data: mappedRecords,
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
        console.error('Get journal masters error:', error);
        next(error);
    }
};

const ISSN_REGEX = /^\d{4}-\d{3}[\dX]$/;

exports.addJournalMaster = async (req, res, next) => {
    try {
        const { journalTitle, title, issn, eissn, impactFactor, type } = req.body;
        const finalTitle = (journalTitle || title || '').trim().toUpperCase();
        
        if (!finalTitle || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Journal Title and Type are required.' 
            });
        }

        const cleanIssn = (issn || '').trim();
        const cleanEissn = (eissn || '').trim();

        if (cleanIssn && !ISSN_REGEX.test(cleanIssn)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid ISSN format. Expected format: 1234-5679 or 1234-567X (e.g. 0028-0836).' 
            });
        }
        if (cleanEissn && !ISSN_REGEX.test(cleanEissn)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid eISSN format. Expected format: 1234-5679 or 1234-567X (e.g. 2049-3630).' 
            });
        }

        const numIF = (impactFactor !== undefined && impactFactor !== null && impactFactor !== 'NA' && impactFactor !== '') 
            ? Number(impactFactor) 
            : null;

        const newRecord = await JournalMaster.create({
            journalTitle: finalTitle,
            issn: cleanIssn,
            eissn: cleanEissn,
            impactFactor: isNaN(numIF) ? null : numIF,
            type: type.trim()
        });

        res.status(201).json({
            success: true,
            message: 'Journal master entry created successfully.',
            data: {
                ...newRecord.toObject(),
                title: newRecord.journalTitle,
                journalTitle: newRecord.journalTitle,
                issn: newRecord.issn || '',
                eissn: newRecord.eissn || '',
                impactFactor: newRecord.impactFactor !== null ? String(newRecord.impactFactor) : 'NA'
            }
        });
    } catch (error) {
        console.error('Add journal master error:', error);
        next(error);
    }
};

exports.updateJournalMaster = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { journalTitle, title, issn, eissn, impactFactor, type } = req.body;
        const finalTitle = (journalTitle || title || '').trim().toUpperCase();

        if (!finalTitle || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Journal Title and Type are required.' 
            });
        }

        const cleanIssn = (issn || '').trim();
        const cleanEissn = (eissn || '').trim();

        if (cleanIssn && !ISSN_REGEX.test(cleanIssn)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid ISSN format. Expected format: 1234-5679 or 1234-567X (e.g. 0028-0836).' 
            });
        }
        if (cleanEissn && !ISSN_REGEX.test(cleanEissn)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid eISSN format. Expected format: 1234-5679 or 1234-567X (e.g. 2049-3630).' 
            });
        }

        const numIF = (impactFactor !== undefined && impactFactor !== null && impactFactor !== 'NA' && impactFactor !== '') 
            ? Number(impactFactor) 
            : null;

        const updatedRecord = await JournalMaster.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    journalTitle: finalTitle,
                    issn: cleanIssn,
                    eissn: cleanEissn,
                    impactFactor: isNaN(numIF) ? null : numIF, 
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
            data: {
                ...updatedRecord.toObject(),
                title: updatedRecord.journalTitle,
                journalTitle: updatedRecord.journalTitle,
                issn: updatedRecord.issn || '',
                eissn: updatedRecord.eissn || '',
                impactFactor: updatedRecord.impactFactor !== null ? String(updatedRecord.impactFactor) : 'NA'
            }
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

exports.bulkUploadJournalMasters = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
        }

        const { defaultType = 'IEEE' } = req.body;
        const results = [];
        const errors = [];

        const fileStream = fs.createReadStream(req.file.path);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let isFirstRow = true;
        let colMap = {
            title: 0,
            impactFactor: 1,
            type: 2,
            issn: -1,
            eissn: -1
        };

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

            if (isFirstRow) {
                isFirstRow = false;
                const lowerHeaders = parts.map(h => h.toLowerCase());
                const hasHeader = lowerHeaders.some(h => 
                    h.includes('title') || h.includes('journal') || h.includes('issn') || h.includes('type') || h.includes('impact') || h.includes('factor')
                );

                if (hasHeader) {
                    lowerHeaders.forEach((h, idx) => {
                        if (h.includes('eissn') || h.includes('e-issn') || h.includes('electronic issn')) {
                            colMap.eissn = idx;
                        } else if (h.includes('issn')) {
                            colMap.issn = idx;
                        } else if (h.includes('title') || h.includes('journal') || h === 'name') {
                            colMap.title = idx;
                        } else if (h.includes('impact') || h.includes('factor') || h === 'if' || h === 'jif') {
                            colMap.impactFactor = idx;
                        } else if (h.includes('type') || h.includes('category')) {
                            colMap.type = idx;
                        }
                    });
                    continue;
                }
            }

            const title = (colMap.title >= 0 ? parts[colMap.title] : parts[0]) || '';
            const impactFactor = (colMap.impactFactor >= 0 ? parts[colMap.impactFactor] : parts[1]) || 'NA';
            const type = (colMap.type >= 0 ? parts[colMap.type] : parts[2]) || defaultType;
            const issn = (colMap.issn >= 0 ? parts[colMap.issn] : parts[3]) || '';
            const eissn = (colMap.eissn >= 0 ? parts[colMap.eissn] : parts[4]) || '';

            if (!title) {
                errors.push({ line: trimmedLine, error: 'Missing journal title' });
                continue;
            }

            const parsedIF = parseFloat(impactFactor);

            results.push({
                journalTitle: title.trim().toUpperCase(),
                issn: (issn || '').trim(),
                eissn: (eissn || '').trim(),
                impactFactor: !isNaN(parsedIF) ? parsedIF : null,
                type: type.trim()
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
            const insertResult = await JournalMaster.insertMany(results, { ordered: false });
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
            message: `Successfully imported ${insertedCount} journals into Journal Master.`,
            insertedCount,
            skippedDuplicates,
            failureCount: errors.length,
            errors
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('Bulk upload journal masters error:', error);
        next(error);
    }
};
