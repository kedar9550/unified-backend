const FundedProject = require('./FundedProject.model');
const Employee = require('../employee/employee.model');

// @desc    Submit new funded project
// @route   POST /api/research/funded-project
// @access  Private (Faculty)
exports.createProject = async (req, res) => {
    try {
        const data = req.body;
        
        // Validation
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

        const project = new FundedProject({
            ...data,
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

// @desc    Get faculty's own projects
// @route   GET /api/research/funded-project
// @access  Private (Faculty)
exports.getMyProjects = async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        const projects = await FundedProject.find(query)
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: projects });
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

// @desc    Get projects pending at HOD
// @route   GET /api/research/funded-project/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        let deptIds = req.user.hodDepartments || [];
        
        const facultyIds = await Employee.find({ coreDepartment: { $in: deptIds } }).distinct('_id');
        
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
