const Journal = require('./Journal.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureYearMonth } = require('../../utils/validationHelper');

// @desc    Submit new journal publication
// @route   POST /api/research/journal
// @access  Private (Faculty)
exports.createJournal = async (req, res) => {
    try {
        const data = req.body;
        
        // Validation
        if (!data.doi || !data.doi.trim()) {
            return res.status(400).json({ success: false, message: "DOI is mandatory." });
        }
        if (!data.paperTitle || !data.paperTitle.trim()) {
            return res.status(400).json({ success: false, message: "Paper Title is mandatory." });
        }

        const cleanedDoi = data.doi.trim();
        const trimmedTitle = data.paperTitle.trim();

        // Check if there is an active (Pending or Approved) submission with the same DOI or Title
        const existingActiveJournal = await Journal.findOne({
            $or: [
                { doi: cleanedDoi },
                { paperTitle: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i') }
            ],
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingActiveJournal) {
            return res.status(400).json({ 
                success: false, 
                message: `A journal submission with this DOI (${cleanedDoi}) or Paper Title already exists and is either Pending or Approved. Duplicates are not allowed unless the previous submission was rejected.` 
            });
        }

        // Date Validation (Not future)
        if (data.publishedYear && data.publishedMonth) {
            if (isFutureYearMonth(data.publishedYear, data.publishedMonth)) {
                return res.status(400).json({ success: false, message: "Publication date cannot be in the future." });
            }
        }

        if (!req.files || !req.files.publishedPaper || !req.files.referencePages || !req.files.completeJournal) {
            return res.status(400).json({ success: false, message: "All documents are mandatory." });
        }

        // Validate completeJournal type strictly to PDF or DOCX (no images allowed)
        if (req.files.completeJournal) {
            const path = require('path');
            const ext = path.extname(req.files.completeJournal[0].originalname).toLowerCase();
            if (ext !== '.pdf' && ext !== '.docx') {
                return res.status(400).json({ success: false, message: "Complete Journal must be a PDF or DOCX file." });
            }
        }

        // Check file sizes individually (500KB limit as per standard)
        const filesToCheck = ['publishedPaper', 'referencePages', 'completeJournal'];
        for (const field of filesToCheck) {
            if (req.files[field] && req.files[field][0].size > 500 * 1024) {
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return res.status(400).json({ 
                    success: false, 
                    message: `${label} is too large (${(req.files[field][0].size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.` 
                });
            }
        }

        // Parse co-authors
        let parsedCoAuthors = [];
        if (typeof data.coAuthors === 'string') {
            try {
                parsedCoAuthors = JSON.parse(data.coAuthors);
            } catch (e) {
                parsedCoAuthors = [];
            }
        } else if (Array.isArray(data.coAuthors)) {
            parsedCoAuthors = data.coAuthors;
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoAuthors, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        let numberOfReferencesBelongingToAGEC = 0;
        if (data.agecReferencingNumbers && data.agecReferencingNumbers.trim()) {
            if (/[^0-9,]/.test(data.agecReferencingNumbers)) {
                return res.status(400).json({ success: false, message: "AGEC Referencing Numbers must only contain numbers and commas." });
            }
            numberOfReferencesBelongingToAGEC = data.agecReferencingNumbers.split(',').map(s => s.trim()).filter(Boolean).length;
        }

        // Fetch JCR Impact Factor from JournalImpactFactor collection
        const JournalImpactFactor = require('../JournalImpactFactor/JournalImpactFactor.model');
        const searchName = (data.journalName || '').trim().toUpperCase();
        const jifRecord = await JournalImpactFactor.findOne({ 
            journalName: new RegExp(`^${escapeRegex(searchName)}$`) 
        });
        
        const jcrImpactFactor = jifRecord ? jifRecord.jif.toString() : data.jcrImpactFactor || null;

        const journal = new Journal({
            ...data,
            facultyId: req.user.userId,
            coAuthors: resolvedAuthors,
            numberOfReferencesBelongingToAGEC,
            appraisalClaimant,
            jcrImpactFactor,
            status: 'Pending at HOD'
        });

        if (req.files) {
            if (req.files.publishedPaper) journal.publishedPaper = `/uploads/journals/${req.files.publishedPaper[0].filename}`;
            if (req.files.referencePages) journal.referencePages = `/uploads/journals/${req.files.referencePages[0].filename}`;
            if (req.files.completeJournal) journal.completeJournal = `/uploads/journals/${req.files.completeJournal[0].filename}`;
        }

        await journal.save();
        res.status(201).json({ success: true, data: journal });
    } catch (err) {
        console.error("Create Journal Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own journals and journals where they are a co-author
// @route   GET /api/research/journal
// @access  Private (Faculty)
exports.getMyJournals = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);
        
        const escapeRegex = (string) => {
            return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        };

        const query = {
            $or: [
                { facultyId: req.user.userId },
                ...(user && user.name ? [{ 'coAuthors.name': new RegExp(`^${escapeRegex(user.name.trim())}$`, 'i') }] : [])
            ]
        };

        const journals = await Journal.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')

            .sort({ createdAt: -1 });

        // Add a visibilityRole to indicate if the user is Applicant or Co-Author
        const journalsWithVisibility = journals.map(j => {
            const jObj = j.toObject();
            if (j.facultyId && j.facultyId._id.toString() !== req.user.userId.toString()) {
                jObj.visibilityRole = "Co-Author";
            } else {
                jObj.visibilityRole = "Applicant";
            }
            return jObj;
        });

        res.json({ success: true, data: journalsWithVisibility });
    } catch (err) {
        console.error("Get My Journals Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get journal by ID
// @route   GET /api/research/journal/:id
// @access  Private
exports.getJournalById = async (req, res) => {
    try {
        const journal = await Journal.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year')

            
        if (!journal) {
            return res.status(404).json({ success: false, message: 'Journal not found' });
        }
        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Get journals pending at HOD
// @route   GET /api/research/journal/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        const Employee = require('../employee/employee.model');
        const deptIds = await getHODDepartments(req.user);
        
        const facultyIds = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ]
        }).distinct('_id');
        
        const journals = await Journal.find({ 
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');
        
        res.json({ success: true, data: journals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/journal/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, hIndex, jcrImpactFactor, impactFactor } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const updates = { 
            status, 
            hodComment: comment 
        };

        if (hIndex !== undefined) updates.hIndex = hIndex;
        const finalJcrImpactFactor = jcrImpactFactor !== undefined ? jcrImpactFactor : impactFactor;
        if (finalJcrImpactFactor !== undefined) updates.jcrImpactFactor = finalJcrImpactFactor;
        if (req.body.citations !== undefined) updates.citations = req.body.citations;

        const journal = await Journal.findByIdAndUpdate(id, updates, { new: true });

        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get journals pending at R&D
// @route   GET /api/research/journal/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const journals = await Journal.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: journals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/journal/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, approvedAmount } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const finalJcrImpactFactor = req.body.jcrImpactFactor !== undefined ? req.body.jcrImpactFactor : req.body.impactFactor;

        const journal = await Journal.findById(id);
        if (!journal) {
            return res.status(404).json({ success: false, message: 'Journal not found' });
        }

        journal.status = status;
        journal.rndComment = comment;
        if (approvedAmount !== undefined) journal.approvedAmount = approvedAmount;
        if (req.body.hIndex !== undefined) journal.hIndex = req.body.hIndex;
        if (finalJcrImpactFactor !== undefined) journal.jcrImpactFactor = finalJcrImpactFactor;
        if (req.body.citations !== undefined) journal.citations = req.body.citations;
        if (req.body.journalQuartile !== undefined) journal.journalQuartile = req.body.journalQuartile;

        if (status === 'Approved' && (journal.applyIncentive === 'Yes' || journal.applyIncentive === 'yes') && journal.appraisalClaimant) {
            journal.incentiveClaimant = journal.appraisalClaimant;
        }

        await journal.save();
        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const axios = require('axios');

exports.getClarivateJournalType = async (req, res) => {
    const { issn } = req.body;

    if (!issn) {
        return res.status(400).json({ success: false, message: 'issn is required' });
    }

    try {
        const response = await axios.post(
            'https://mjl.clarivate.com/api/mjl/jprof/public/rank-search',
            {
                searchValue:      issn,
                pageNum:          1,
                pageSize:         10,
                sortOrder:        [{ name: 'RELEVANCE', order: 'DESC' }],
                filters: [{
                    filterName:    'COVERED_LATEST_JEDI',
                    matchType:     'BOOLEAN_EXACT',
                    caseSensitive: false,
                    values:        [{ type: 'VALUE', value: 'true' }]
                }],
                searchIdentifier: 'proxy-' + Date.now()
            },
            {
                headers: {
                    'Accept':        'application/json',
                    'Content-Type':  'application/json',
                    'x-1p-appid':    'mjl',
                    'origin':        'https://mjl.clarivate.com',
                    'referer':       'https://mjl.clarivate.com/search-results',
                    'authorization': 'Bearer'
                }
            }
        );

        const profiles = response.data?.journalProfiles || [];
        const types = new Set();

        profiles.forEach(p => {
            const jp = p?.journalProfile || {};

            const jcrCategories = jp.jcrCategories || [];
            jcrCategories.forEach(cat => {
                const edition = (cat?.jcrEdition || '').toUpperCase();
                if (['SCIE', 'SCI', 'ESCI', 'SSCI', 'AHCI'].includes(edition)) {
                    types.add(edition);
                }
            });

            if (types.size === 0) {
                const products = jp.products || [];
                products.forEach(prod => {
                    const desc = (prod?.description || '').toUpperCase();
                    if (desc.includes('SCIENCE CITATION INDEX EXPANDED')) types.add('SCIE');
                    else if (desc.includes('SCIENCE CITATION INDEX'))     types.add('SCI');
                    if (desc.includes('SOCIAL SCIENCES CITATION'))        types.add('SSCI');
                    if (desc.includes('ARTS & HUMANITIES'))               types.add('AHCI');
                    if (desc.includes('EMERGING SOURCES'))                types.add('ESCI');
                });
            }
        });

        return res.json({
            success:      true,
            inWoS:        types.size > 0,
            journalType:  types.size > 0 ? [...types].join(' / ') : null,
            totalRecords: response.data?.totalRecords || 0
        });

    } catch (err) {
        const status  = err.response?.status || 500;
        const message = err.response?.data   || err.message;
        console.error('Clarivate proxy error:', status, message);
        return res.status(status).json({ success: false, message: typeof message === 'object' ? JSON.stringify(message) : message });
    }
};

// @desc    Update Journal Metrics (H-Index, Impact Factor, Citations) at any time
// @route   PUT /api/research/journal/update-metrics/:id
// @access  Private (R&D Admin)
exports.updateJournalMetrics = async (req, res) => {
    try {
        const { id } = req.params;
        const { hIndex, jcrImpactFactor, impactFactor, citations, journalQuartile } = req.body;

        const updates = {};
        if (hIndex !== undefined) updates.hIndex = hIndex;
        const finalJcrImpactFactor = jcrImpactFactor !== undefined ? jcrImpactFactor : impactFactor;
        if (finalJcrImpactFactor !== undefined) updates.jcrImpactFactor = finalJcrImpactFactor;
        if (citations !== undefined) updates.citations = citations;
        if (journalQuartile !== undefined) updates.journalQuartile = journalQuartile;

        const journal = await Journal.findByIdAndUpdate(id, updates, { new: true })
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year');

        if (!journal) {
            return res.status(404).json({ success: false, message: 'Journal not found' });
        }

        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

