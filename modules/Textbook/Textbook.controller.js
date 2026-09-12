const Textbook = require('./Textbook.model');
const Edition = require('./Edition.model');
const Employee = require('../employee/employee.model');
const axios = require('axios');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureYearMonth } = require('../../utils/validationHelper');

// @desc    Submit new textbook publication
// @route   POST /api/research/textbook
// @access  Private (Faculty)
exports.createTextbook = async (req, res) => {
    try {
        const data = req.body;
        
        // Trim and normalize ISBN
        if (data.isbn) data.isbn = data.isbn.trim().replace(/-/g, '');
        
        // 1. Mandatory & Future Year/Month Validation
        if (!data.isbn || !data.title) {
            return res.status(400).json({ success: false, message: "ISBN and Title are required." });
        }

        if (data.year && data.month) {
            if (isFutureYearMonth(data.year, data.month)) {
                return res.status(400).json({ success: false, message: "Publication date cannot be in the future." });
            }
        }

        if (data.cost) {
            const numCost = Number(data.cost);
            if (isNaN(numCost) || numCost < 0) {
                return res.status(400).json({ success: false, message: "Cost must be a valid positive numeric value." });
            }
        }

        // 2. Mandatory Documents Validation
        if (!req.files || !req.files.coverPage || !req.files.authorAffiliation || !req.files.index) {
            return res.status(400).json({ success: false, message: "Cover Page, Author Affiliation, and Index documents are mandatory." });
        }

        const trimmedTitle = data.title ? data.title.trim() : '';

        const existingRecord = await Textbook.findOne({
            $or: [
                { isbn: data.isbn },
                ...(trimmedTitle ? [{ title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i') }] : [])
            ]
        });

        if (existingRecord) {
            const isIsbnMatch = existingRecord.isbn && existingRecord.isbn.toLowerCase() === data.isbn.toLowerCase();
            return res.status(400).json({ 
                success: false, 
                message: isIsbnMatch
                    ? "A textbook with this ISBN already exists. If it was rejected, please use the Edit & Resubmit option instead of creating a new one."
                    : `A textbook with this Title ("${trimmedTitle}") already exists in the system.`
            });
        }

        // Parse authors if it's a string (FormData sends arrays as strings)
        let parsedAuthors = [];
        if (typeof data.authors === 'string') {
            try {
                parsedAuthors = JSON.parse(data.authors);
            } catch (e) {
                parsedAuthors = [];
            }
        } else if (Array.isArray(data.authors)) {
            parsedAuthors = data.authors;
        }
        
        // Get the logged in user details for their own author entry
        const loggedInUser = await Employee.findById(req.user.userId);

        // Map authors — store employeeId as String directly, no DB lookup needed
        const finalAuthors = [];
        let hasOtherAusAuthors = false;

        for (const author of parsedAuthors) {
            const isUser = Number(author.authorPosition) === Number(data.userAuthorPosition);
            const empId = isUser ? loggedInUser.institutionId : (author.employeeId || author.empId || null);
            const isAUS = isUser || author.affiliationType === 'Aditya University';

            if (!isUser && isAUS) {
                // AUS co-author — flag for manual claim
                hasOtherAusAuthors = true;
            }

            finalAuthors.push({
                authorPosition: author.authorPosition,
                authorName: isUser ? loggedInUser.name : author.authorName,
                affiliationType: isUser ? 'Aditya University' : (author.affiliationType || 'Others'),
                employeeId: isAUS && empId ? String(empId).trim() : null,  // store institutionId string directly
                affiliationName: isUser ? 'Aditya University' : (author.affiliationName || ''),
                studentId: author.studentId || null,
                CoAuthorType: author.CoAuthorType || (author.studentId ? 'student' : 'faculty'),
                isIncentiveApplicant: isUser ? (data.applyIncentive === 'Yes') : false,
                contributorOnly: isUser ? (data.applyIncentive === 'No') : true
            });
        }


        const { getDefaultClaimant } = require('../../utils/claimantHelper');
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        
        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantEmpId = applicant ? applicant.institutionId : null;
        let computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? applicantEmpId : null;

        let finalFacultyId = req.user.userId;
        let finalStatus = 'Pending at R&D';
        let finalEntryType = 'Self';

        if (data.isDirectEntry === 'true') {
            const activeRole = (req.headers['active-role'] || req.user?.role || '').toUpperCase().trim();
            const userRoles = (req.user?.roles || []).flatMap(r => {
                const roleName = (r.role?.name || '').toUpperCase().trim();
                const roleKey = (r.role?.key || '').toUpperCase().trim();
                const roleDirect = (typeof r === 'string' ? r : (typeof r.role === 'string' ? r.role : '')).toUpperCase().trim();
                return [roleName, roleKey, roleDirect].filter(Boolean);
            });
            const isRndAdmin = activeRole === 'RESEARCH_DEAN' || activeRole === 'RESEARCH_COORDINATOR' ||
                               userRoles.includes('RESEARCH_DEAN') || userRoles.includes('RESEARCH_COORDINATOR') ||
                               userRoles.includes('RESEARCH DEAN') || userRoles.includes('ADMIN');

            if (!isRndAdmin) {
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

            if (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') {
                if (!data.approvedAmount || Number(data.approvedAmount) <= 0) {
                    return res.status(400).json({ success: false, message: "Approved Incentive Amount is required when Apply Incentive is Yes." });
                }
            }

            if (!data.appraisalEligible) {
                return res.status(400).json({ success: false, message: "Appraisal Eligible status is required for direct entry." });
            }

            finalFacultyId = targetFaculty._id;
            finalStatus = 'Approved';
            finalEntryType = 'Admin';
            computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? targetFaculty.institutionId : null;
        }

        const textbook = new Textbook({
            ...data,
            title: trimmedTitle,
            isbn: data.isbn, // use normalized isbn
            college: data.college || 'Not Set',
            facultyId: finalFacultyId,
            authors: finalAuthors,
            appraisalClaimant,
            status: finalStatus,
            incentiveClaimant: computedIncentiveClaimant,
            approvedAmount: (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? (data.approvedAmount ? Number(data.approvedAmount) : 0) : undefined,
            appraisalEligible: data.appraisalEligible || (data.isDirectEntry === 'true' ? 'Yes' : null),
            entryType: finalEntryType
        });

        if (req.files) {
            if (req.files.coverPage) textbook.coverPage = `/uploads/textbooks/${req.files.coverPage[0].filename}`;
            if (req.files.authorAffiliation) textbook.authorAffiliation = `/uploads/textbooks/${req.files.authorAffiliation[0].filename}`;
            if (req.files.index) textbook.index = `/uploads/textbooks/${req.files.index[0].filename}`;
        }

        await textbook.save();
        
        // Upsert Edition
        if (data.edition) {
            try {
                const normalizedEdition = data.edition.replace(/\s+/g, ' ').trim();
                await Edition.updateOne(
                    { name: normalizedEdition },
                    { $setOnInsert: { name: normalizedEdition } },
                    { upsert: true }
                );
            } catch (e) {
                console.error("Failed to upsert edition:", e);
            }
        }

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
                        message: `${emp.name || 'A faculty member'} has submitted a new Textbook: ${textbook.title}`,
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
                    title: 'Textbook Publication Added',
                    message: `R&D has directly added an approved Textbook for you: ${textbook.title}`,
                    link: `/faculty/research-metrics`
                 });
            }
        } catch (notifErr) {
            console.error("Failed to send textbook notification:", notifErr);
        }

        res.status(201).json({ success: true, data: textbook });
    } catch (err) {
        console.error("Create Textbook Error:", err);
        if (err.code === 11000) {
            const field = Object.keys(err.keyValue)[0];
            const message = `A textbook with this ${field} already exists.`;
            return res.status(400).json({ success: false, message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update and resubmit an existing rejected textbook
// @route   PUT /api/research/textbook/:id
// @access  Private (Faculty)
exports.updateTextbook = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const textbook = await Textbook.findById(id);
        if (!textbook) {
            return res.status(404).json({ success: false, message: "Textbook not found." });
        }

        if (textbook.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Not authorized to edit this textbook." });
        }

        if (!textbook.status.includes('Rejected')) {
            return res.status(400).json({ success: false, message: "Only rejected textbooks can be edited and resubmitted." });
        }

        if (data.isbn) {
            data.isbn = data.isbn.trim().replace(/-/g, '');
            const existingRecord = await Textbook.findOne({
                _id: { $ne: id },
                isbn: data.isbn
            });

            if (existingRecord) {
                return res.status(400).json({
                    success: false,
                    message: "A textbook with this ISBN already exists."
                });
            }
        }

        if (data.year || data.month) {
            const year = data.year || textbook.year;
            const month = data.month || textbook.month;
            if (isFutureYearMonth(year, month)) {
                return res.status(400).json({ success: false, message: "Publication date cannot be in the future." });
            }
        }

        let finalAuthors = textbook.authors;
        let hasOtherAusAuthors = false;
        
        if (data.authors) {
            let parsedAuthors = [];
            if (typeof data.authors === 'string') {
                try {
                    parsedAuthors = JSON.parse(data.authors);
                } catch (e) {
                    parsedAuthors = [];
                }
            } else if (Array.isArray(data.authors)) {
                parsedAuthors = data.authors;
            }

            const loggedInUser = await Employee.findById(req.user.userId);
            finalAuthors = [];
            
            for (const author of parsedAuthors) {
                const isUser = Number(author.authorPosition) === Number(data.userAuthorPosition || textbook.userAuthorPosition);
                const empId = isUser ? loggedInUser.institutionId : (author.employeeId || author.empId || null);
                const isAUS = isUser || author.affiliationType === 'Aditya University';

                if (!isUser && isAUS) {
                    hasOtherAusAuthors = true;
                }

                finalAuthors.push({
                    authorPosition: author.authorPosition,
                    authorName: isUser ? loggedInUser.name : author.authorName,
                    affiliationType: isUser ? 'Aditya University' : (author.affiliationType || 'Others'),
                    employeeId: isAUS && empId ? String(empId).trim() : null,
                    affiliationName: isUser ? 'Aditya University' : (author.affiliationName || ''),
                    isIncentiveApplicant: isUser ? (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') : false,
                    contributorOnly: isUser ? (data.applyIncentive === 'No' || data.applyIncentive === 'no') : true
                });
            }
        } else {
             // Calculate hasOtherAusAuthors based on existing authors if not updated
             finalAuthors.forEach(a => {
                 if (a.affiliationType === 'Aditya University' && a.employeeId !== textbook.authors.find(x => x.isIncentiveApplicant)?.employeeId) {
                     hasOtherAusAuthors = true;
                 }
             });
        }

        const { getDefaultClaimant } = require('../../utils/claimantHelper');
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applyIncentive = data.applyIncentive !== undefined ? data.applyIncentive : textbook.applyIncentive;
        const computedIncentiveClaimant = (applyIncentive === 'Yes' || applyIncentive === 'yes') ? applicant.institutionId : null;

        Object.keys(data).forEach(key => {
            if (key !== 'authors' && key !== 'status' && key !== 'facultyId' && data[key] !== undefined) {
                textbook[key] = data[key];
            }
        });

        textbook.authors = finalAuthors;
        textbook.appraisalClaimant = appraisalClaimant;
        textbook.incentiveClaimant = computedIncentiveClaimant;
        textbook.status = 'Pending at R&D';
        textbook.hodComment = '';
        textbook.rndComment = '';

        const fs = require('fs');
        const path = require('path');
        const deleteOldFile = (oldPath) => {
            if (oldPath) {
                try {
                    const cleanPath = oldPath.replace(/^\//, '');
                    const fullPath = path.join(__dirname, '../..', cleanPath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                } catch (e) {}
            }
        };

        if (req.files) {
            if (req.files.coverPage) {
                deleteOldFile(textbook.coverPage);
                textbook.coverPage = `/uploads/textbooks/${req.files.coverPage[0].filename}`;
            }
            if (req.files.authorAffiliation) {
                deleteOldFile(textbook.authorAffiliation);
                textbook.authorAffiliation = `/uploads/textbooks/${req.files.authorAffiliation[0].filename}`;
            }
            if (req.files.index) {
                deleteOldFile(textbook.index);
                textbook.index = `/uploads/textbooks/${req.files.index[0].filename}`;
            }
        }

        await textbook.save();

        if (data.edition) {
            try {
                const normalizedEdition = data.edition.replace(/\s+/g, ' ').trim();
                const Edition = require('./Edition.model');
                await Edition.updateOne(
                    { name: normalizedEdition },
                    { $setOnInsert: { name: normalizedEdition } },
                    { upsert: true }
                );
            } catch (e) {}
        }

        res.json({ success: true, data: textbook });
    } catch (err) {
        console.error("Update Textbook Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own textbooks and textbooks where they are a co-author
// @route   GET /api/research/textbook
// @access  Private (Faculty)
exports.getMyTextbooks = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);
        const institutionId = user ? user.institutionId : null;

        const query = {
            $or: [
                { facultyId: req.user.userId },
                { 'authors.employeeId': institutionId },
                ...(user && user.name ? [{ 'authors.authorName': new RegExp(`^${escapeRegex(user.name.trim())}$`, 'i') }] : [])
            ]
        };

        const textbooks = await Textbook.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });

        // Add a field to indicate if the user is just a co-author for dashboard visibility
        const textbooksWithVisibility = textbooks.map(tb => {
            const tbObj = tb.toObject();
            if (tb.facultyId && tb.facultyId._id.toString() !== req.user.userId.toString()) {
                tbObj.visibilityRole = "Co-Author Only";
            } else {
                tbObj.visibilityRole = "Applicant";
            }
            return tbObj;
        });

        res.json({ success: true, data: textbooksWithVisibility });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Fetch Book Details by ISBN
// @route   GET /api/research/textbook/isbn/:isbn
// @access  Private
exports.fetchISBN = async (req, res) => {
    try {
        const isbn = req.params.isbn.trim().replace(/-/g, '');
        const response = await axios.get(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
        
        const bookKey = `ISBN:${isbn}`;
        if (response.data && response.data[bookKey]) {
            const bookData = response.data[bookKey];
            res.json({
                success: true,
                data: {
                    title: bookData.title,
                    publisher: bookData.publishers ? bookData.publishers.map(p => p.name).join(', ') : '',
                    yearOfPublication: bookData.publish_date ? bookData.publish_date : ''
                }
            });
        } else {
            res.status(404).json({ success: false, message: "Book details not found for this ISBN." });
        }
    } catch (err) {
        console.error("ISBN Fetch Error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch book details from external API." });
    }
};

// @desc    Get all editions for dropdown
// @route   GET /api/research/textbook/editions
// @access  Private
exports.getEditions = async (req, res) => {
    try {
        const editions = await Edition.find({}).sort({ createdAt: 1 });
        res.json({ success: true, data: editions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Add a new custom edition
// @route   POST /api/research/textbook/editions
// @access  Private
exports.addEdition = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "Edition name is required." });

        const newEdition = new Edition({ name });
        await newEdition.save();

        res.status(201).json({ success: true, data: newEdition });
    } catch (err) {
        // Handle unique constraint error
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: "This edition already exists." });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};


const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Get textbooks pending at HOD
// @route   GET /api/research/textbook/pending-hod
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

// @desc    Get textbook by ID
// @route   GET /api/research/textbook/:id
// @access  Private
exports.getTextbookById = async (req, res) => {
    try {
        const textbook = await Textbook.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year');
            
        if (!textbook) {
            return res.status(404).json({ success: false, message: 'Textbook not found' });
        }
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
        const { action, comment, approvedAmount } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const textbook = await Textbook.findById(id);
        if (!textbook) {
            return res.status(404).json({ success: false, message: 'Textbook not found' });
        }

        if (action === 'Approve') {
            if (!req.body.appraisalEligible) {
                return res.status(400).json({ success: false, message: 'Appraisal Eligible status is required for approval.' });
            }
            if (textbook.applyIncentive === 'Yes' || textbook.applyIncentive === 'yes') {
                if (approvedAmount === undefined || approvedAmount === null || approvedAmount === '' || Number(approvedAmount) <= 0) {
                    return res.status(400).json({ success: false, message: 'Approved Incentive Amount is required when Apply Incentive is Yes.' });
                }
            }
        }

        textbook.status = status;
        textbook.rndComment = comment;
        if (action === 'Approve' && approvedAmount !== undefined) {
            textbook.approvedAmount = approvedAmount;
        }
        if (action === 'Approve' && req.body.appraisalEligible && ['Yes', 'No'].includes(req.body.appraisalEligible)) {
            textbook.appraisalEligible = req.body.appraisalEligible;
        }

        if (status === 'Approved' && (textbook.applyIncentive === 'Yes' || textbook.applyIncentive === 'yes') && textbook.appraisalClaimant) {
            textbook.incentiveClaimant = textbook.appraisalClaimant;
        }

        await textbook.save();
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
        
        if (typeof data.authors === 'string') {
            try {
                data.authors = JSON.parse(data.authors);
            } catch (e) {}
        }

        const textbook = await Textbook.findById(id);
        if (!textbook) return res.status(404).json({ success: false, message: "Textbook not found" });

        // Merge updates
        Object.assign(textbook, data);
        textbook.discrepancyRaised = false; // Resolved
        
        if (req.files) {
            if (req.files.coverPage) textbook.coverPage = `/uploads/textbooks/${req.files.coverPage[0].filename}`;
            if (req.files.authorAffiliation) textbook.authorAffiliation = `/uploads/textbooks/${req.files.authorAffiliation[0].filename}`;
            if (req.files.index) textbook.index = `/uploads/textbooks/${req.files.index[0].filename}`;
        }

        await textbook.save();
        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
