const Consultancy = require('./Consultancy.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureYearMonth } = require('../../utils/validationHelper');

// @desc    Submit new consultancy work
// @route   POST /api/research/consultancy
// @access  Private (Faculty)
exports.createConsultancy = async (req, res) => {
    try {
        const data = req.body;
        
        // 1. Mandatory Fields Validation
        if (!data.title || !data.fundingAgency || !data.fundingAdityaUniversity || !data.amount || !data.applyingSeedGrant) {
            return res.status(400).json({ success: false, message: "Please fill all required fields." });
        }

        const trimmedTitle = data.title.trim();

        // 2. Duplicate Validation
        const existingRecord = await Consultancy.findOne({
            title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i')
        });

        if (existingRecord) {
            return res.status(400).json({ 
                success: false, 
                message: "A consultancy entry with this title already exists. If it was rejected, please use the Edit & Resubmit option instead of creating a new one." 
            });
        }

        // 3. Numeric Fields Validation
        const numAmount = Number(data.amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, message: "Consultancy Amount must be a positive numeric value." });
        }

        if (data.duration) {
            const numDuration = Number(data.duration);
            if (isNaN(numDuration) || numDuration <= 0) {
                return res.status(400).json({ success: false, message: "Duration must be a positive numeric value." });
            }
        }

        // 4. Date Validation
        if (data.year && data.month) {
            if (isFutureYearMonth(data.year, data.month)) {
                return res.status(400).json({ success: false, message: "Commencement date cannot be in the future." });
            }
        }
        
        let parsedCoInvestigators = [];
        if (typeof data.coInvestigators === 'string') {
            try {
                parsedCoInvestigators = JSON.parse(data.coInvestigators);
            } catch (e) {
                parsedCoInvestigators = [];
            }
        } else if (Array.isArray(data.coInvestigators)) {
            parsedCoInvestigators = data.coInvestigators;
        }

        const { resolveCoAuthorsAndClaims } = require('../../utils/claimantHelper');
        const { resolvedAuthors } = await resolveCoAuthorsAndClaims(parsedCoInvestigators, req.user.userId);

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantInstId = applicant ? applicant.institutionId : null;

        const claimantsList = [applicantInstId, ...resolvedAuthors.map(a => a.employeeId)].filter(Boolean);
        const appraisalClaimants = [...new Set(claimantsList)];

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
        }

        const consultancy = new Consultancy({
            ...data,
            applyIncentive: 'No',
            title: trimmedTitle,
            facultyId: finalFacultyId,
            coInvestigators: resolvedAuthors,
            appraisalClaimants,
            incentiveClaimant: null,
            status: finalStatus,
            entryType: finalEntryType
        });

        await consultancy.save();

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
                        message: `${emp.name || 'A faculty member'} has submitted a new Consultancy: ${consultancy.title}`,
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
                    title: 'Consultancy Added',
                    message: `R&D has directly added an approved Consultancy for you: ${consultancy.title}`,
                    link: `/faculty/research-metrics`
                 });
            }
        } catch (notifErr) {
            console.error("Failed to send consultancy notification:", notifErr);
        }
        res.status(201).json({ success: true, data: consultancy });
    } catch (err) {
        console.error("Create Consultancy Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update and resubmit an existing rejected consultancy
// @route   PUT /api/research/consultancy/:id
// @access  Private (Faculty)
exports.updateConsultancy = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const consultancy = await Consultancy.findById(id);
        if (!consultancy) {
            return res.status(404).json({ success: false, message: "Consultancy not found." });
        }

        // Verify ownership
        if (consultancy.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Not authorized to edit this consultancy." });
        }

        if (!consultancy.status.includes('Rejected')) {
            return res.status(400).json({ success: false, message: "Only rejected consultancies can be edited and resubmitted." });
        }

        // Validate Title for duplicates
        if (data.title) {
            const checkTitle = data.title.trim();
            const existingRecord = await Consultancy.findOne({
                _id: { $ne: id },
                title: new RegExp(`^${escapeRegex(checkTitle)}$`, 'i')
            });

            if (existingRecord) {
                return res.status(400).json({ 
                    success: false, 
                    message: "A consultancy entry with this title already exists." 
                });
            }
        }

        // Numeric Validation
        if (data.amount) {
            const numAmount = Number(data.amount);
            if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: "Consultancy Amount must be a positive numeric value." });
        }
        if (data.duration) {
            const numDuration = Number(data.duration);
            if (isNaN(numDuration) || numDuration <= 0) return res.status(400).json({ success: false, message: "Duration must be a positive numeric value." });
        }

        // Date Validation
        if (data.year || data.month) {
            const year = data.year || consultancy.year;
            const month = data.month || consultancy.month;
            if (isFutureYearMonth(year, month)) {
                return res.status(400).json({ success: false, message: "Commencement date cannot be in the future." });
            }
        }

        // Parse co-investigators
        let parsedCoInvestigators = consultancy.coInvestigators;
        if (data.coInvestigators) {
            if (typeof data.coInvestigators === 'string') {
                try {
                    parsedCoInvestigators = JSON.parse(data.coInvestigators);
                } catch (e) {
                    parsedCoInvestigators = [];
                }
            } else if (Array.isArray(data.coInvestigators)) {
                parsedCoInvestigators = data.coInvestigators;
            }
        }

        const { resolveCoAuthorsAndClaims } = require('../../utils/claimantHelper');
        const { resolvedAuthors } = await resolveCoAuthorsAndClaims(parsedCoInvestigators, req.user.userId);

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantInstId = applicant ? applicant.institutionId : null;
        const claimantsList = [applicantInstId, ...resolvedAuthors.map(a => a.employeeId)].filter(Boolean);
        const appraisalClaimants = [...new Set(claimantsList)];

        // Update fields
        Object.keys(data).forEach(key => {
            if (key !== 'coInvestigators' && key !== 'status' && key !== 'facultyId' && data[key] !== undefined) {
                consultancy[key] = data[key];
            }
        });

        consultancy.title = data.title ? data.title.trim() : consultancy.title;
        consultancy.coInvestigators = resolvedAuthors;
        consultancy.appraisalClaimants = appraisalClaimants;
        consultancy.applyIncentive = 'No';
        consultancy.incentiveClaimant = null;
        consultancy.status = 'Pending at R&D'; // Resubmit
        consultancy.hodComment = '';
        consultancy.rndComment = '';

        await consultancy.save();

        res.json({ success: true, data: consultancy });
    } catch (err) {
        console.error("Update Consultancy Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own consultancy work
// @route   GET /api/research/consultancy
// @access  Private (Faculty)
exports.getMyConsultancies = async (req, res) => {
    try {
        const query = {
            $or: [
                { facultyId: req.user.userId },
                { 'coInvestigators.employeeId': req.user.userId }
            ]
        };
        const consultancies = await Consultancy.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .populate('coInvestigators.employeeId', 'name institutionId')
            .sort({ createdAt: -1 });

        const consultanciesWithVisibility = consultancies.map(c => {
            const cObj = c.toObject();
            if (c.facultyId && c.facultyId._id.toString() !== req.user.userId.toString()) {
                cObj.visibilityRole = "Co-Investigator";
            } else {
                cObj.visibilityRole = "Applicant";
            }
            return cObj;
        });

        res.json({ success: true, data: consultanciesWithVisibility });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get consultancy by ID
// @route   GET /api/research/consultancy/:id
// @access  Private
exports.getConsultancyById = async (req, res) => {
    try {
        const consultancy = await Consultancy.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('coInvestigators.employeeId', 'name institutionId')
            .populate('academicYear', 'year');
            
        if (!consultancy) {
            return res.status(404).json({ success: false, message: 'Consultancy not found' });
        }
        res.json({ success: true, data: consultancy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/consultancy/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const consultancy = await Consultancy.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: consultancy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/consultancy/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, approvedAmount } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const consultancy = await Consultancy.findById(id);
        if (!consultancy) {
            return res.status(404).json({ success: false, message: 'Consultancy not found' });
        }

        consultancy.status = status;
        consultancy.rndComment = comment;

        await consultancy.save();
        res.json({ success: true, data: consultancy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
