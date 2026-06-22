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
            title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i'),
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingRecord) {
            return res.status(400).json({ 
                success: false, 
                message: "A consultancy entry with this title already exists and is either Pending or Approved. Duplicate submissions are not allowed." 
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

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoInvestigators, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        const consultancy = new Consultancy({
            ...data,
            title: trimmedTitle,
            facultyId: req.user.userId,
            coInvestigators: resolvedAuthors,
            appraisalClaimant,
            status: 'Pending at HOD'
        });

        await consultancy.save();
        res.status(201).json({ success: true, data: consultancy });
    } catch (err) {
        console.error("Create Consultancy Error:", err);
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
        if (approvedAmount !== undefined) {
            consultancy.approvedAmount = approvedAmount;
        }

        if (status === 'Approved' && (consultancy.applyIncentive === 'Yes' || consultancy.applyIncentive === 'yes') && consultancy.appraisalClaimant) {
            consultancy.incentiveClaimant = consultancy.appraisalClaimant;
        }

        await consultancy.save();
        res.json({ success: true, data: consultancy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
