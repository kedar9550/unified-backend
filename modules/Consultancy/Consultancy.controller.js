const Consultancy = require('./Consultancy.model');
const Employee = require('../employee/employee.model');

// @desc    Submit new consultancy work
// @route   POST /api/research/consultancy
// @access  Private (Faculty)
exports.createConsultancy = async (req, res) => {
    try {
        const data = req.body;
        
        const consultancy = new Consultancy({
            ...data,
            facultyId: req.user.userId,
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
        const query = { facultyId: req.user.userId };
        const consultancies = await Consultancy.find(query)
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: consultancies });
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
        const updates = { 
            status, 
            rndComment: comment 
        };
        
        if (approvedAmount !== undefined) {
            updates.approvedAmount = approvedAmount;
        }

        const consultancy = await Consultancy.findByIdAndUpdate(id, updates, { new: true });

        res.json({ success: true, data: consultancy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
