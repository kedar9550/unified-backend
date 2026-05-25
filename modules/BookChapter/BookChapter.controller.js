const BookChapter = require('./BookChapter.model');
const Employee = require('../employee/employee.model');

// @desc    Submit new book chapter publication
// @route   POST /api/research/book-chapter
// @access  Private (Faculty)
exports.createBookChapter = async (req, res) => {
    try {
        const data = req.body;
        
        // Validation
        if (!req.files || !req.files.coverPage || !req.files.authorAffiliation || !req.files.index || !req.files.softCopy) {
            return res.status(400).json({ success: false, message: "All documents are mandatory." });
        }

        // Check file sizes individually to provide specific error messages
        const filesToCheck = ['coverPage', 'authorAffiliation', 'index', 'softCopy'];
        for (const field of filesToCheck) {
            if (req.files[field] && req.files[field][0].size > 500 * 1024) {
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return res.status(400).json({ 
                    success: false, 
                    message: `${label} is too large (${(req.files[field][0].size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.` 
                });
            }
        }

        // Parse co-authors if it's a string
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

        const bookChapter = new BookChapter({
            ...data,
            facultyId: req.user.userId,
            coAuthors: parsedCoAuthors,
            status: 'Pending at HOD'
        });

        if (req.files) {
            if (req.files.coverPage) bookChapter.coverPage = `/uploads/book-chapters/${req.files.coverPage[0].filename}`;
            if (req.files.authorAffiliation) bookChapter.authorAffiliation = `/uploads/book-chapters/${req.files.authorAffiliation[0].filename}`;
            if (req.files.index) bookChapter.index = `/uploads/book-chapters/${req.files.index[0].filename}`;
            if (req.files.softCopy) bookChapter.softCopy = `/uploads/book-chapters/${req.files.softCopy[0].filename}`;
        }

        await bookChapter.save();
        res.status(201).json({ success: true, data: bookChapter });
    } catch (err) {
        console.error("Create Book Chapter Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own book chapters
// @route   GET /api/research/book-chapter
// @access  Private (Faculty)
exports.getMyBookChapters = async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        const bookChapters = await BookChapter.find(query)
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: bookChapters });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get book chapter by ID
// @route   GET /api/research/book-chapter/:id
// @access  Private
exports.getBookChapterById = async (req, res) => {
    try {
        const bookChapter = await BookChapter.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year');
            
        if (!bookChapter) {
            return res.status(404).json({ success: false, message: 'Book Chapter not found' });
        }
        res.json({ success: true, data: bookChapter });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Get book chapters pending at HOD
// @route   GET /api/research/book-chapter/pending-hod
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
        
        const chapters = await BookChapter.find({ 
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');
        
        res.json({ success: true, data: chapters });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/book-chapter/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const chapter = await BookChapter.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: chapter });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get book chapters pending at R&D
// @route   GET /api/research/book-chapter/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const chapters = await BookChapter.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: chapters });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/book-chapter/rnd-action/:id
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

        const chapter = await BookChapter.findByIdAndUpdate(id, updates, { new: true });

        res.json({ success: true, data: chapter });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
