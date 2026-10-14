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
                { issn: searchRegex },
                { eissn: searchRegex }
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total, totalAll] = await Promise.all([
            JournalImpactFactor.find(query)
                .sort({ journalName: 1 })
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

const ISSN_REGEX = /^\d{4}-\d{3}[\dX]$/;

exports.addJournalImpactFactor = async (req, res, next) => {
    try {
        const { journalName, abbreviatedJournal, jif, issn, eissn } = req.body;
        
        if (!journalName || jif === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Journal Name and JIF (Impact Factor) are required.' 
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

        const newRecord = await JournalImpactFactor.create({
            journalName: journalName.trim().toUpperCase(),
            abbreviatedJournal: (abbreviatedJournal || '').trim(),
            issn: cleanIssn,
            eissn: cleanEissn,
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
        const { journalName, abbreviatedJournal, jif, issn, eissn } = req.body;

        if (!journalName || jif === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Journal Name and JIF (Impact Factor) are required.' 
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

        const updatedRecord = await JournalImpactFactor.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    journalName: journalName.trim().toUpperCase(), 
                    abbreviatedJournal: (abbreviatedJournal || '').trim(), 
                    issn: cleanIssn, 
                    eissn: cleanEissn, 
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
        let headerIndices = null;

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

            // Detect headers row
            if (isFirstRow) {
                isFirstRow = false;
                const lowerParts = parts.map(p => p.toLowerCase());
                const isHeader = lowerParts.some(p => 
                    p.includes('journal') || 
                    p.includes('title') || 
                    p.includes('jif') ||
                    p.includes('issn')
                );

                if (isHeader) {
                    headerIndices = {
                        journalName: lowerParts.findIndex(p => p.includes('name') || p.includes('journal') || p.includes('title')),
                        abbreviatedJournal: lowerParts.findIndex(p => p.includes('abbreviat') || p.includes('abbr')),
                        issn: lowerParts.findIndex(p => p === 'issn' || (p.includes('issn') && !p.includes('eissn') && !p.includes('e-issn') && !p.includes('electronic'))),
                        eissn: lowerParts.findIndex(p => p.includes('eissn') || p.includes('e-issn') || p.includes('electronic issn')),
                        jif: lowerParts.findIndex(p => p.includes('jif') || p.includes('impact'))
                    };
                    continue;
                }
            }

            let journalName = '';
            let abbreviatedJournal = '';
            let issn = '';
            let eissn = '';
            let jifStr = '';

            if (headerIndices && headerIndices.journalName !== -1) {
                journalName = headerIndices.journalName !== -1 ? parts[headerIndices.journalName] || '' : '';
                abbreviatedJournal = headerIndices.abbreviatedJournal !== -1 ? parts[headerIndices.abbreviatedJournal] || '' : '';
                issn = headerIndices.issn !== -1 ? parts[headerIndices.issn] || '' : '';
                eissn = headerIndices.eissn !== -1 ? parts[headerIndices.eissn] || '' : '';
                jifStr = headerIndices.jif !== -1 ? parts[headerIndices.jif] || '' : '';
            } else {
                // Positional mapping fallback
                if (parts.length === 5) {
                    // Standard 5 columns: Journal Name, Abbreviated Journal, ISSN, eISSN, JIF
                    journalName = parts[0] || '';
                    abbreviatedJournal = parts[1] || '';
                    issn = parts[2] || '';
                    eissn = parts[3] || '';
                    jifStr = parts[4] || '';
                } else if (parts.length === 6 && !isNaN(Number(parts[0]))) {
                    // Legacy 6 columns with Rank at index 0: Rank, Journal Name, Abbreviated Journal, ISSN, eISSN, JIF
                    journalName = parts[1] || '';
                    abbreviatedJournal = parts[2] || '';
                    issn = parts[3] || '';
                    eissn = parts[4] || '';
                    jifStr = parts[5] || '';
                } else if (parts.length >= 7) {
                    // Legacy 7 columns with Rank at index 0 & Publisher: Rank, Journal Name, Abbreviated Journal, ISSN, eISSN, Publisher, JIF
                    journalName = parts[1] || '';
                    abbreviatedJournal = parts[2] || '';
                    issn = parts[3] || '';
                    eissn = parts[4] || '';
                    jifStr = parts[parts.length - 1] || '';
                } else {
                    journalName = parts[0] || '';
                    abbreviatedJournal = parts[1] || '';
                    jifStr = parts[parts.length - 1] || '';
                }
            }

            let cleanedJif = (jifStr || '').trim().replace(/,/g, '.');
            if (cleanedJif.startsWith('<')) {
                cleanedJif = cleanedJif.replace('<', '').trim();
            }
            let jif = Number(cleanedJif);
            if (isNaN(jif) || cleanedJif === '' || cleanedJif.toUpperCase() === 'N/A' || cleanedJif === '-' || cleanedJif.toUpperCase() === 'NOT AVAILABLE') {
                jif = 0;
            }

            if (!journalName) {
                errors.push({ line: trimmedLine, error: 'Missing journal name' });
                continue;
            }

            results.push({
                journalName: journalName.trim().toUpperCase(),
                abbreviatedJournal: abbreviatedJournal.trim(),
                issn: issn.trim(),
                eissn: eissn.trim(),
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
                errors: errors.slice(0, 50)
            });
        }

        // Deduplicate by journalName in memory to avoid MongoDB WriteConflict during parallel upsert
        const uniqueMap = new Map();
        for (const item of results) {
            uniqueMap.set(item.journalName, item);
        }
        const uniqueResults = Array.from(uniqueMap.values());

        let insertedCount = 0;

        try {
            const bulkOps = uniqueResults.map(item => ({
                updateOne: {
                    filter: { journalName: item.journalName },
                    update: { $set: item },
                    upsert: true
                }
            }));

            // Chunk in batches of 1,000 to prevent database timeout and wire payload overflow
            const BATCH_SIZE = 1000;
            for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
                const batch = bulkOps.slice(i, i + BATCH_SIZE);
                const batchResult = await JournalImpactFactor.bulkWrite(batch, { ordered: false });
                insertedCount += (batchResult.upsertedCount || 0) + (batchResult.modifiedCount || 0);
            }
        } catch (bulkError) {
            console.error('Bulk write JIF error:', bulkError);
            return res.status(500).json({ success: false, message: 'Bulk upload failed.', error: bulkError.message });
        }

        res.status(200).json({
            success: true,
            message: `Successfully processed CSV file (${uniqueResults.length} records).`,
            insertedCount,
            totalRows: results.length,
            uniqueJournals: uniqueResults.length,
            errorCount: errors.length,
            errors: errors.slice(0, 50)
        });
    } catch (error) {
        console.error('Bulk upload JIF error:', error);
        next(error);
    }
};

exports.lookupJournalImpactFactor = async (req, res, next) => {
    try {
        const { issn, eissn, journalName } = req.query;
        const cleanIssn = (issn || '').trim();
        const cleanEissn = (eissn || '').trim();
        const cleanName = (journalName || '').trim();

        if (!cleanIssn && !cleanEissn && !cleanName) {
            return res.status(200).json({
                success: true,
                found: false,
                data: { jif: 0, jcrImpactFactor: "0" }
            });
        }

        let record = null;

        // 1. Prioritize ISSN and eISSN matching
        if (cleanIssn || cleanEissn) {
            const orConds = [];
            const getVariants = (val) => {
                const trimmed = val.trim();
                const unhyphenated = trimmed.replace(/-/g, '');
                const variants = [trimmed];
                if (unhyphenated.length === 8) {
                    variants.push(`${unhyphenated.slice(0, 4)}-${unhyphenated.slice(4)}`);
                    variants.push(unhyphenated);
                }
                return Array.from(new Set(variants));
            };

            if (cleanIssn) {
                const variants = getVariants(cleanIssn);
                variants.forEach(v => {
                    orConds.push({ issn: new RegExp(`^${escapeRegex(v)}$`, 'i') });
                    orConds.push({ eissn: new RegExp(`^${escapeRegex(v)}$`, 'i') });
                });
            }

            if (cleanEissn) {
                const variants = getVariants(cleanEissn);
                variants.forEach(v => {
                    orConds.push({ issn: new RegExp(`^${escapeRegex(v)}$`, 'i') });
                    orConds.push({ eissn: new RegExp(`^${escapeRegex(v)}$`, 'i') });
                });
            }

            if (orConds.length > 0) {
                record = await JournalImpactFactor.findOne({ $or: orConds }).lean();
            }
        }

        // 2. Fallback to Journal Name matching if not found by ISSN/eISSN
        if (!record && cleanName) {
            record = await JournalImpactFactor.findOne({
                journalName: new RegExp(`^${escapeRegex(cleanName)}$`, 'i')
            }).lean();
        }

        if (record && record.jif !== undefined && record.jif !== null) {
            return res.status(200).json({
                success: true,
                found: true,
                data: {
                    jif: record.jif,
                    jcrImpactFactor: String(record.jif),
                    journalName: record.journalName,
                    issn: record.issn,
                    eissn: record.eissn,
                    matchedBy: (record.issn === cleanIssn || record.eissn === cleanIssn || record.issn === cleanEissn || record.eissn === cleanEissn) ? 'issn_eissn' : 'journal_name'
                }
            });
        }

        return res.status(200).json({
            success: true,
            found: false,
            data: {
                jif: 0,
                jcrImpactFactor: "0"
            }
        });
    } catch (error) {
        console.error('Lookup Journal Impact Factor error:', error);
        next(error);
    }
};
