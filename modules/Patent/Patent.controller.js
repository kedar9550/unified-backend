const Patent = require('./Patent.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureDate } = require('../../utils/validationHelper');

// @desc    Submit new patent publication
// @route   POST /api/research/patent
// @access  Private (Faculty)
exports.createPatent = async (req, res) => {
    try {
        const data = req.body;
        
        // 1. Mandatory Fields Validation
        if (!data.title || !data.patentName || !data.applyingSeedGrant || !data.dateOfFiling || !data.filingNo || !data.patentFiledCountry) {
            return res.status(400).json({ success: false, message: "Please fill all required fields." });
        }

        // Validation for documents
        if (!req.files || !req.files.eFilingReceipt || !req.files.form1) {
            return res.status(400).json({ success: false, message: "All documents are mandatory." });
        }

        // Check file sizes individually (500KB limit)
        const filesToCheck = ['eFilingReceipt', 'form1'];
        for (const field of filesToCheck) {
            if (req.files[field] && req.files[field][0].size > 500 * 1024) {
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return res.status(400).json({ 
                    success: false, 
                    message: `${label} is too large (${(req.files[field][0].size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.` 
                });
            }
        }

        const trimmedTitle = data.title.trim();

        // 2. Duplicate Validation
        const existingRecord = await Patent.findOne({
            title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i')
        });

        if (existingRecord) {
            return res.status(400).json({ 
                success: false, 
                message: "A patent entry with this title already exists. If it was rejected, please use the Edit & Resubmit option instead of creating a new one." 
            });
        }

        // 3. Date Validation (Not future)
        if (isFutureDate(data.dateOfFiling)) {
            return res.status(400).json({ success: false, message: "Date of Filing cannot be in the future." });
        }

        // Parse co-inventors
        let parsedCoInventors = [];
        if (typeof data.coInventors === 'string') {
            try {
                parsedCoInventors = JSON.parse(data.coInventors);
            } catch (e) {
                parsedCoInventors = [];
            }
        } else if (Array.isArray(data.coInventors)) {
            parsedCoInventors = data.coInventors;
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoInventors, req.user.userId);
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

        const patent = new Patent({
            ...data,
            title: trimmedTitle,
            facultyId: finalFacultyId,
            coInventors: resolvedAuthors,
            patentStatus: data.status, // Map 'status' from frontend to 'patentStatus' in model
            appraisalClaimant,
            status: finalStatus,
            incentiveClaimant: computedIncentiveClaimant,
            entryType: finalEntryType
        });

        if (req.files) {
            if (req.files.eFilingReceipt) patent.eFilingReceipt = `/uploads/patents/${req.files.eFilingReceipt[0].filename}`;
            if (req.files.form1) patent.form1 = `/uploads/patents/${req.files.form1[0].filename}`;
        }

        await patent.save();

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
                        message: `${emp.name || 'A faculty member'} has submitted a new Patent: ${patent.title}`,
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
                    title: 'Patent Added',
                    message: `R&D has directly added an approved Patent for you: ${patent.title}`,
                    link: `/faculty/research-metrics`
                 });
            }
        } catch (notifErr) {
            console.error("Failed to send patent notification:", notifErr);
        }
        res.status(201).json({ success: true, data: patent });
    } catch (err) {
        console.error("Create Patent Error:", err);
        if (err.code === 11000) {
            const field = Object.keys(err.keyValue)[0];
            const message = `A patent with this ${field === 'title' ? 'TITLE OF THE PATENT' : 'PATENT FILING NO'} already exists.`;
            return res.status(400).json({ success: false, message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update and resubmit an existing rejected patent
// @route   PUT /api/research/patent/:id
// @access  Private (Faculty)
exports.updatePatent = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const patent = await Patent.findById(id);
        if (!patent) {
            return res.status(404).json({ success: false, message: "Patent not found." });
        }

        // Verify ownership
        if (patent.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Not authorized to edit this patent." });
        }

        if (!patent.status.includes('Rejected')) {
            return res.status(400).json({ success: false, message: "Only rejected patents can be edited and resubmitted." });
        }

        // Validate file sizes
        const filesToCheck = ['eFilingReceipt', 'form1'];
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
        if (data.title) {
            const checkTitle = data.title.trim();
            const existingRecord = await Patent.findOne({
                _id: { $ne: id },
                title: new RegExp(`^${escapeRegex(checkTitle)}$`, 'i')
            });

            if (existingRecord) {
                return res.status(400).json({ 
                    success: false, 
                    message: "A patent entry with this title already exists." 
                });
            }
        }

        // Date Validation
        if (data.dateOfFiling || data.dateOfPublished || data.dateOfGranted) {
            if (data.dateOfFiling && isFutureDate(data.dateOfFiling)) return res.status(400).json({ success: false, message: "Date of Filing cannot be in the future." });
        }

        // Parse co-inventors
        let parsedCoInventors = patent.coInventors;
        if (data.coInventors) {
            if (typeof data.coInventors === 'string') {
                try {
                    parsedCoInventors = JSON.parse(data.coInventors);
                } catch (e) {
                    parsedCoInventors = [];
                }
            } else if (Array.isArray(data.coInventors)) {
                parsedCoInventors = data.coInventors;
            }
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoInventors, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applyIncentive = data.applyIncentive !== undefined ? data.applyIncentive : patent.applyIncentive;
        const computedIncentiveClaimant = (applyIncentive === 'Yes' || applyIncentive === 'yes') ? applicant.institutionId : null;

        // Update fields
        Object.keys(data).forEach(key => {
            if (key !== 'coInventors' && key !== 'status' && key !== 'facultyId' && data[key] !== undefined) {
                // patent.status stores the approval state, but frontend form has a 'status' field mapping to 'patentStatus'
                if (key === 'status') {
                    patent.patentStatus = data.status;
                } else {
                    patent[key] = data[key];
                }
            }
        });

        patent.title = data.title ? data.title.trim() : patent.title;
        patent.coInventors = resolvedAuthors;
        patent.appraisalClaimant = appraisalClaimant;
        patent.incentiveClaimant = computedIncentiveClaimant;
        patent.status = 'Pending at R&D'; // Resubmit
        patent.hodComment = '';
        patent.rndComment = '';

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
            if (req.files.eFilingReceipt) {
                deleteOldFile(patent.eFilingReceipt);
                patent.eFilingReceipt = `/uploads/patents/${req.files.eFilingReceipt[0].filename}`;
            }
            if (req.files.form1) {
                deleteOldFile(patent.form1);
                patent.form1 = `/uploads/patents/${req.files.form1[0].filename}`;
            }
        }

        await patent.save();

        res.json({ success: true, data: patent });
    } catch (err) {
        console.error("Update Patent Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own patents and patents where they are a co-inventor
// @route   GET /api/research/patent
// @access  Private (Faculty)
exports.getMyPatents = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);
        
        const query = {
            $or: [
                { facultyId: req.user.userId },
                { 'coInventors.employeeId': user ? user.institutionId : null },
                ...(user && user.name ? [{ 'coInventors.name': new RegExp(`^${escapeRegex(user.name.trim())}$`, 'i') }] : [])
            ]
        };

        const patents = await Patent.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });

        const patentsWithVisibility = patents.map(p => {
            const pObj = p.toObject();
            if (p.facultyId && p.facultyId._id.toString() !== req.user.userId.toString()) {
                pObj.visibilityRole = "Co-Inventor";
            } else {
                pObj.visibilityRole = "Applicant";
            }
            return pObj;
        });

        res.json({ success: true, data: patentsWithVisibility });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get patent by ID
// @route   GET /api/research/patent/:id
// @access  Private
exports.getPatentById = async (req, res) => {
    try {
        const patent = await Patent.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year')
            .populate('coInventors.employeeId', 'name institutionId');
            
        if (!patent) {
            return res.status(404).json({ success: false, message: 'Patent not found' });
        }
        res.json({ success: true, data: patent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Get patents pending at HOD
// @route   GET /api/research/patent/pending-hod
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
        
        const patents = await Patent.find({ 
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');
        
        res.json({ success: true, data: patents });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/patent/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const patent = await Patent.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: patent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get patents pending at R&D
// @route   GET /api/research/patent/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const patents = await Patent.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: patents });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/patent/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, approvedAmount } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const patent = await Patent.findById(id);
        if (!patent) {
            return res.status(404).json({ success: false, message: 'Patent not found' });
        }

        patent.status = status;
        patent.rndComment = comment;
        if (approvedAmount !== undefined) {
            patent.approvedAmount = approvedAmount;
        }

        if (status === 'Approved' && (patent.applyIncentive === 'Yes' || patent.applyIncentive === 'yes') && patent.appraisalClaimant) {
            patent.incentiveClaimant = patent.appraisalClaimant;
        }

        await patent.save();
        res.json({ success: true, data: patent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
