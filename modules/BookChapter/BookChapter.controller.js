const BookChapter = require('./BookChapter.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureYearMonth } = require('../../utils/validationHelper');

// @desc    Submit new book chapter publication
// @route   POST /api/research/book-chapter
// @access  Private (Faculty)
exports.createBookChapter = async (req, res) => {
    try {
        const data = req.body;

        // 1. Mandatory Fields Validation
        if (!data.chapterTitle || !data.textBookName || !data.publisher || !data.year || !data.month) {
            return res.status(400).json({ success: false, message: "Please fill all required fields." });
        }

        // Validation
        if (!req.files || !req.files.authorAffiliation) {
            return res.status(400).json({ success: false, message: "Page displaying author affiliation and chapter title is mandatory." });
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

        const trimmedChapterTitle = data.chapterTitle.trim();

        // 2. Duplicate Validation
        const existingRecord = await BookChapter.findOne({
            chapterTitle: new RegExp(`^${escapeRegex(trimmedChapterTitle)}$`, 'i'),
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingRecord) {
            return res.status(400).json({
                success: false,
                message: "A book chapter with this title already exists and is either Pending or Approved. Duplicate submissions are not allowed."
            });
        }

        // 3. Date Validation (Not future)
        if (isFutureYearMonth(data.year, data.month)) {
            return res.status(400).json({ success: false, message: "Publication date cannot be in the future." });
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

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoAuthors, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        
        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantEmpId = applicant ? applicant.institutionId : null;
        const computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? applicantEmpId : null;
        const bookChapter = new BookChapter({
            ...data,
            chapterTitle: trimmedChapterTitle,
            facultyId: req.user.userId,
            coAuthors: resolvedAuthors,
            appraisalClaimant,
            status: 'Pending at HOD'
        ,
            incentiveClaimant: computedIncentiveClaimant});

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

// @desc    Get faculty's own book chapters and chapters where they are a co-author
// @route   GET /api/research/book-chapter
// @access  Private (Faculty)
exports.getMyBookChapters = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);

        const query = {
            $or: [
                { facultyId: req.user.userId },
                ...(user && user.name ? [{ 'coAuthors.name': new RegExp(`^${escapeRegex(user.name.trim())}$`, 'i') }] : [])
            ]
        };

        const bookChapters = await BookChapter.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });

        const chaptersWithVisibility = bookChapters.map(c => {
            const cObj = c.toObject();
            if (c.facultyId && c.facultyId._id.toString() !== req.user.userId.toString()) {
                cObj.visibilityRole = "Co-Author";
            } else {
                cObj.visibilityRole = "Applicant";
            }
            return cObj;
        });

        res.json({ success: true, data: chaptersWithVisibility });
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
        const chapter = await BookChapter.findById(id);
        if (!chapter) {
            return res.status(404).json({ success: false, message: 'Book Chapter not found' });
        }

        chapter.status = status;
        chapter.rndComment = comment;
        if (approvedAmount !== undefined) {
            chapter.approvedAmount = approvedAmount;
        }

        if (status === 'Approved' && (chapter.applyIncentive === 'Yes' || chapter.applyIncentive === 'yes') && chapter.appraisalClaimant) {
            chapter.incentiveClaimant = chapter.appraisalClaimant;
        }

        await chapter.save();
        res.json({ success: true, data: chapter });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};