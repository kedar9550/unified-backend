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
            chapterTitle: new RegExp(`^${escapeRegex(trimmedChapterTitle)}$`, 'i')
        });

        if (existingRecord) {
            return res.status(400).json({
                success: false,
                message: "A book chapter with this title already exists. If it was rejected, please use the Edit & Resubmit option instead of creating a new one."
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
        let computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? applicantEmpId : null;

        let finalFacultyId = req.user.userId;
        let finalStatus = 'Pending at R&D';
        let finalEntryType = 'Self';

        if (data.isDirectEntry === 'true') {
            if (req.user.role !== 'RESEARCH_DEAN' && req.user.role !== 'RESEARCH_COORDINATOR') {
                return res.status(403).json({ success: false, message: "Only R&D Admin or Dean can use direct entry." });
            }

            const targetEmpId = data.targetFacultyEmpId;
            if (!targetEmpId) {
                return res.status(400).json({ success: false, message: "Target Faculty Employee ID is required for direct entry." });
            }

            const targetFaculty = await Employee.findOne({ 
                institutionId: new RegExp(`^${escapeRegex(targetEmpId.trim())}$`, 'i') 
            });

            if (!targetFaculty) {
                return res.status(400).json({ success: false, message: `Target Faculty with ID ${targetEmpId} not found.` });
            }

            if (!targetFaculty.isActive) {
                return res.status(400).json({ success: false, message: `Faculty ${targetFaculty.name} (${targetFaculty.institutionId}) is inactive and cannot be selected.` });
            }

            finalFacultyId = targetFaculty._id;
            finalStatus = 'Approved';
            finalEntryType = 'Admin';
            computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? targetFaculty.institutionId : null;
        }

        const bookChapter = new BookChapter({
            ...data,
            chapterTitle: trimmedChapterTitle,
            facultyId: finalFacultyId,
            coAuthors: resolvedAuthors,
            appraisalClaimant,
            status: finalStatus,
            incentiveClaimant: computedIncentiveClaimant,
            entryType: finalEntryType
        });

        if (req.files) {
            if (req.files.coverPage) bookChapter.coverPage = `/uploads/book-chapters/${req.files.coverPage[0].filename}`;
            if (req.files.authorAffiliation) bookChapter.authorAffiliation = `/uploads/book-chapters/${req.files.authorAffiliation[0].filename}`;
            if (req.files.index) bookChapter.index = `/uploads/book-chapters/${req.files.index[0].filename}`;
            if (req.files.softCopy) bookChapter.softCopy = `/uploads/book-chapters/${req.files.softCopy[0].filename}`;
        }

        await bookChapter.save();

        // Target: Send notification to the applicant's reporting boss
        try {
            const { getReportingBossId } = require('../hierarchy/reportingBoss.helper');
            const NotificationService = require('../notification/notification.service');
            const EmployeeModel = require('../employee/employee.model');

            const emp = await EmployeeModel.findById(req.user.userId);
            if (emp) {
                const bossUserId = await getReportingBossId(req.user.userId);
                if (bossUserId) {
                    await NotificationService.sendNotification({
                        recipientId: bossUserId,
                        senderId: req.user.userId,
                        module: 'Research',
                        type: 'INFO',
                        title: 'New Research Submission',
                        message: `${emp.name || 'A faculty member'} has submitted a new Book Chapter: ${bookChapter.chapterTitle}`,
                        link: `/research/approvals`, 
                        metadata: { targetRole: "ReportingBoss" }
                    });
                }
            }

            if (data.isDirectEntry === 'true' && finalFacultyId.toString() !== req.user.userId) {
                 await NotificationService.sendNotification({
                    recipientId: finalFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: 'SUCCESS',
                    title: 'Book Chapter Publication Added',
                    message: `R&D has directly added an approved Book Chapter for you: ${bookChapter.chapterTitle}`,
                    link: `/faculty/research-metrics`
                 });
            }
        } catch (notifErr) {
            console.error("Failed to send book chapter notification:", notifErr);
        }

        res.status(201).json({ success: true, data: bookChapter });
    } catch (err) {
        console.error("Create Book Chapter Error:", err);
        if (err.code === 11000) {
            const field = Object.keys(err.keyValue)[0];
            const message = `A book chapter with this ${field === 'chapterTitle' ? 'title' : 'DOI'} already exists.`;
            return res.status(400).json({ success: false, message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update and resubmit an existing rejected book chapter
// @route   PUT /api/research/book-chapter/:id
// @access  Private (Faculty)
exports.updateBookChapter = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const bookChapter = await BookChapter.findById(id);
        if (!bookChapter) {
            return res.status(404).json({ success: false, message: "Book Chapter not found." });
        }

        // Verify ownership
        if (bookChapter.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Not authorized to edit this book chapter." });
        }

        if (!bookChapter.status.includes('Rejected')) {
            return res.status(400).json({ success: false, message: "Only rejected book chapters can be edited and resubmitted." });
        }

        // Validate file sizes
        const filesToCheck = ['coverPage', 'authorAffiliation', 'index', 'softCopy'];
        if (req.files) {
            for (const field of filesToCheck) {
                if (req.files[field] && req.files[field][0].size > 500 * 1024) {
                    const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    return res.status(400).json({
                        success: false,
                        message: `${label} is too large. Maximum allowed size is 500KB.`
                    });
                }
            }
        }

        // Validate Title for duplicates
        if (data.chapterTitle) {
            const checkTitle = data.chapterTitle.trim();
            const existingRecord = await BookChapter.findOne({
                _id: { $ne: id },
                chapterTitle: new RegExp(`^${escapeRegex(checkTitle)}$`, 'i')
            });

            if (existingRecord) {
                return res.status(400).json({
                    success: false,
                    message: "A book chapter with this title already exists."
                });
            }
        }

        // Date Validation
        if (data.year || data.month) {
            const year = data.year || bookChapter.year;
            const month = data.month || bookChapter.month;
            if (isFutureYearMonth(year, month)) {
                return res.status(400).json({ success: false, message: "Publication date cannot be in the future." });
            }
        }

        // Parse co-authors
        let parsedCoAuthors = bookChapter.coAuthors;
        if (data.coAuthors) {
            if (typeof data.coAuthors === 'string') {
                try {
                    parsedCoAuthors = JSON.parse(data.coAuthors);
                } catch (e) {
                    parsedCoAuthors = [];
                }
            } else if (Array.isArray(data.coAuthors)) {
                parsedCoAuthors = data.coAuthors;
            }
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoAuthors, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantEmpId = applicant ? applicant.institutionId : null;
        const applyIncentive = data.applyIncentive !== undefined ? data.applyIncentive : bookChapter.applyIncentive;
        const computedIncentiveClaimant = (applyIncentive === 'Yes' || applyIncentive === 'yes') ? applicantEmpId : null;

        // Update fields
        Object.keys(data).forEach(key => {
            if (key !== 'coAuthors' && key !== 'status' && key !== 'facultyId' && data[key] !== undefined) {
                bookChapter[key] = data[key];
            }
        });

        bookChapter.chapterTitle = data.chapterTitle ? data.chapterTitle.trim() : bookChapter.chapterTitle;
        bookChapter.coAuthors = resolvedAuthors;
        bookChapter.appraisalClaimant = appraisalClaimant;
        bookChapter.incentiveClaimant = computedIncentiveClaimant;
        bookChapter.status = 'Pending at R&D'; // Resubmit
        bookChapter.hodComment = '';
        bookChapter.rndComment = '';

        const fs = require('fs');
        const path = require('path');
        const deleteOldFile = (oldPath) => {
            if (oldPath) {
                try {
                    const cleanPath = oldPath.replace(/^\//, ''); // Remove leading slash
                    const fullPath = path.join(__dirname, '../..', cleanPath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                } catch (e) {}
            }
        };

        if (req.files) {
            if (req.files.coverPage) {
                deleteOldFile(bookChapter.coverPage);
                bookChapter.coverPage = `/uploads/book-chapters/${req.files.coverPage[0].filename}`;
            }
            if (req.files.authorAffiliation) {
                deleteOldFile(bookChapter.authorAffiliation);
                bookChapter.authorAffiliation = `/uploads/book-chapters/${req.files.authorAffiliation[0].filename}`;
            }
            if (req.files.index) {
                deleteOldFile(bookChapter.index);
                bookChapter.index = `/uploads/book-chapters/${req.files.index[0].filename}`;
            }
            if (req.files.softCopy) {
                deleteOldFile(bookChapter.softCopy);
                bookChapter.softCopy = `/uploads/book-chapters/${req.files.softCopy[0].filename}`;
            }
        }

        await bookChapter.save();

        res.json({ success: true, data: bookChapter });
    } catch (err) {
        console.error("Update Book Chapter Error:", err);
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
                { 'coAuthors.employeeId': user ? user.institutionId : null },
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