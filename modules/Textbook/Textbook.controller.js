const Textbook = require('./Textbook.model');

// @desc    Submit new textbook publication
// @route   POST /api/research/textbook
// @access  Private (Faculty)
exports.createTextbook = async (req, res) => {
    try {
        const data = req.body;
        // Parse coAuthors if it's a string (FormData sends arrays as strings)
        if (typeof data.coAuthors === 'string') {
            try {
                data.coAuthors = JSON.parse(data.coAuthors);
            } catch (e) {
                data.coAuthors = [];
            }
        }
        
        const textbook = new Textbook({
            ...data,
            facultyId: req.user._id,
            status: 'Pending at HOD'
        });

        if (req.files) {
            if (req.files.coverPage) textbook.coverPage = req.files.coverPage[0].filename;
            if (req.files.authorAffiliation) textbook.authorAffiliation = req.files.authorAffiliation[0].filename;
            if (req.files.index) textbook.index = req.files.index[0].filename;
        }

        await textbook.save();
        res.status(201).json({ success: true, data: textbook });
    } catch (err) {
        console.error("Create Textbook Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own textbooks
// @route   GET /api/research/textbook
// @access  Private (Faculty)
exports.getMyTextbooks = async (req, res) => {
    try {
        const textbooks = await Textbook.find({ facultyId: req.user._id })
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: textbooks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get textbooks pending at HOD
// @route   GET /api/research/textbook/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        // Find employees in HOD's departments
        // req.user.hodDepartments is usually set in auth middleware for HOD role
        const Employee = require('../employee/employee.model');
        const deptIds = req.user.hodDepartments || [];
        
        const facultyIds = await Employee.find({ department: { $in: deptIds } }).distinct('_id');
        
        const textbooks = await Textbook.find({ 
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');
        
        res.json({ success: true, data: textbooks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/textbook/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const textbook = await Textbook.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get textbooks pending at R&D
// @route   GET /api/research/textbook/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const textbooks = await Textbook.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: textbooks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/textbook/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const textbook = await Textbook.findByIdAndUpdate(id, { 
            status, 
            rndComment: comment 
        }, { new: true });

        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Raise discrepancy for approved textbook
// @route   PUT /api/research/textbook/raise-discrepancy/:id
// @access  Private (Faculty)
exports.raiseDiscrepancy = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        
        const updates = {
            discrepancyRaised: true,
            discrepancyComment: comment
        };

        if (req.file) {
            updates.discrepancyProof = req.file.filename;
        }

        const textbook = await Textbook.findByIdAndUpdate(id, updates, { new: true });
        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D edit after discrepancy
// @route   PUT /api/research/textbook/rnd-edit/:id
// @access  Private (R&D)
exports.rndEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        if (typeof data.coAuthors === 'string') {
            try {
                data.coAuthors = JSON.parse(data.coAuthors);
            } catch (e) {
                // Keep existing coAuthors or set to empty
            }
        }

        const textbook = await Textbook.findById(id);
        if (!textbook) return res.status(404).json({ success: false, message: "Textbook not found" });

        // Merge updates
        Object.assign(textbook, data);
        textbook.discrepancyRaised = false; // Resolved
        
        if (req.files) {
            if (req.files.coverPage) textbook.coverPage = req.files.coverPage[0].filename;
            if (req.files.authorAffiliation) textbook.authorAffiliation = req.files.authorAffiliation[0].filename;
            if (req.files.index) textbook.index = req.files.index[0].filename;
        }

        await textbook.save();
        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
