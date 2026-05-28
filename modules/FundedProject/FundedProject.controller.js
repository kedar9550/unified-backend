const FundedProject = require('./FundedProject.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureDate } = require('../../utils/validationHelper');

// @desc    Submit new funded project
// @route   POST /api/research/funded-project
// @access  Private (Faculty)
exports.createProject = async (req, res) => {
    try {
        const data = req.body;
        
        // 1. Mandatory Fields Validation
        if (!data.title || !data.fundingAgency || !data.sanctionedAmount || !data.sanctionDate || !data.applyingSeedGrant) {
            return res.status(400).json({ success: false, message: "Please fill all required fields." });
        }

        // Validation for file
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Sanction Order is mandatory." });
        }

        // Check file size (500KB limit)
        if (req.file.size > 500 * 1024) {
            return res.status(400).json({ 
                success: false, 
                message: `File is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.` 
            });
        }

        const trimmedTitle = data.title.trim();

        // 2. Duplicate Validation
        const existingRecord = await FundedProject.findOne({
            title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i'),
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingRecord) {
            return res.status(400).json({ 
                success: false, 
                message: "A funded project entry with this title already exists and is either Pending or Approved. Duplicate submissions are not allowed." 
            });
        }

        // 3. Numeric Fields Validation
        if (data.duration) {
            const numDuration = Number(data.duration);
            if (isNaN(numDuration) || numDuration <= 0) {
                return res.status(400).json({ success: false, message: "Duration of Project in Years must be a positive numeric value." });
            }
        }

        if (data.recurring) {
            const numRecurring = Number(data.recurring);
            if (isNaN(numRecurring) || numRecurring < 0) {
                return res.status(400).json({ success: false, message: "Recurring amount must be a valid positive numeric value." });
            }
        }

        if (data.nonRecurring) {
            const numNonRecurring = Number(data.nonRecurring);
            if (isNaN(numNonRecurring) || numNonRecurring < 0) {
                return res.status(400).json({ success: false, message: "Non-Recurring amount must be a valid positive numeric value." });
            }
        }

        const numSanctioned = Number(data.sanctionedAmount);
        if (isNaN(numSanctioned) || numSanctioned <= 0) {
            return res.status(400).json({ success: false, message: "Sanctioned Amount must be a positive numeric value." });
        }

        // 4. Date Validation (Not future)
        if (isFutureDate(data.sanctionDate)) {
            return res.status(400).json({ success: false, message: "Sanction Date cannot be in the future." });
        }

        const project = new FundedProject({
            ...data,
            title: trimmedTitle,
            facultyId: req.user.userId,
            sanctionOrder: `/uploads/funded-projects/${req.file.filename}`,
            status: 'Pending at HOD'
        });

        await project.save();
        res.status(201).json({ success: true, data: project });
    } catch (err) {
        console.error("Create Funded Project Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own projects and projects where they are a co-investigator
// @route   GET /api/research/funded-project
// @access  Private (Faculty)
exports.getMyProjects = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);
        
        const query = {
            $or: [
                { facultyId: req.user.userId },
                ...(user && user.name ? [{ 'otherInvestigators': new RegExp(escapeRegex(user.name.trim()), 'i') }] : [])
            ]
        };

        const projects = await FundedProject.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });

        const projectsWithVisibility = projects.map(p => {
            const pObj = p.toObject();
            if (p.facultyId && p.facultyId._id.toString() !== req.user.userId.toString()) {
                pObj.visibilityRole = "Co-Investigator";
            } else {
                pObj.visibilityRole = "Applicant";
            }
            return pObj;
        });

        res.json({ success: true, data: projectsWithVisibility });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get project by ID
// @route   GET /api/research/funded-project/:id
// @access  Private
exports.getProjectById = async (req, res) => {
    try {
        const project = await FundedProject.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year');
            
        if (!project) {
            return res.status(404).json({ success: false, message: 'Funded Project not found' });
        }
        res.json({ success: true, data: project });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Get projects pending at HOD
// @route   GET /api/research/funded-project/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        const deptIds = await getHODDepartments(req.user);
        
        const facultyIds = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ]
        }).distinct('_id');
        
        const projects = await FundedProject.find({ 
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');
        
        res.json({ success: true, data: projects });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/funded-project/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const project = await FundedProject.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: project });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get projects pending at R&D
// @route   GET /api/research/funded-project/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const projects = await FundedProject.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: projects });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/funded-project/rnd-action/:id
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

        const project = await FundedProject.findByIdAndUpdate(id, updates, { new: true });

        res.json({ success: true, data: project });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
