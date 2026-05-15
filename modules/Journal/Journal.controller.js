const Journal = require('./Journal.model');
const Employee = require('../employee/employee.model');

// @desc    Submit new journal publication
// @route   POST /api/research/journal
// @access  Private (Faculty)
exports.createJournal = async (req, res) => {
    try {
        const data = req.body;
        
        // Validation
        if (!req.files || !req.files.publishedPaper || !req.files.referencePages) {
            return res.status(400).json({ success: false, message: "All documents are mandatory." });
        }

        // Check file sizes individually (500KB limit as per standard)
        const filesToCheck = ['publishedPaper', 'referencePages'];
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

        const journal = new Journal({
            ...data,
            facultyId: req.user.userId,
            coAuthors: parsedCoAuthors,
            status: 'Pending at HOD'
        });

        if (req.files) {
            if (req.files.publishedPaper) journal.publishedPaper = `/uploads/journals/${req.files.publishedPaper[0].filename}`;
            if (req.files.referencePages) journal.referencePages = `/uploads/journals/${req.files.referencePages[0].filename}`;
        }

        await journal.save();
        res.status(201).json({ success: true, data: journal });
    } catch (err) {
        console.error("Create Journal Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own journals
// @route   GET /api/research/journal
// @access  Private (Faculty)
exports.getMyJournals = async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        const journals = await Journal.find(query)
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: journals });
    } catch (err) {
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
            .populate('academicYear', 'year');
            
        if (!journal) {
            return res.status(404).json({ success: false, message: 'Journal not found' });
        }
        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get journals pending at HOD
// @route   GET /api/research/journal/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        const Employee = require('../employee/employee.model');
        let deptIds = req.user.hodDepartments || [];
        
        const facultyIds = await Employee.find({ coreDepartment: { $in: deptIds } }).distinct('_id');
        
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
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const journal = await Journal.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

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
        const updates = { 
            status, 
            rndComment: comment 
        };
        
        if (approvedAmount !== undefined) {
            updates.approvedAmount = approvedAmount;
        }

        const journal = await Journal.findByIdAndUpdate(id, updates, { new: true });

        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
