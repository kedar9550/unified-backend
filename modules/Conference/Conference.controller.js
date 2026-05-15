const Conference = require('./Conference.model');
const Employee = require('../employee/employee.model');

// @desc    Submit new conference publication
// @route   POST /api/research/conference
// @access  Private (Faculty)
exports.createConference = async (req, res) => {
    try {
        const data = req.body;
        
        const files = req.files || {};
        const certificate = files.certificate ? `/uploads/conferences/${files.certificate[0].filename}` : null;
        const proceedings = files.proceedings ? `/uploads/conferences/${files.proceedings[0].filename}` : null;

        const conference = new Conference({
            ...data,
            facultyId: req.user.userId,
            certificate,
            proceedings,
            status: 'Pending at HOD'
        });

        await conference.save();
        res.status(201).json({ success: true, data: conference });
    } catch (err) {
        console.error("Create Conference Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own conference publications
// @route   GET /api/research/conference
// @access  Private (Faculty)
exports.getMyConferences = async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        const conferences = await Conference.find(query)
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: conferences });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get conference by ID
// @route   GET /api/research/conference/:id
// @access  Private
exports.getConferenceById = async (req, res) => {
    try {
        const conference = await Conference.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year');
            
        if (!conference) {
            return res.status(404).json({ success: false, message: 'Conference not found' });
        }
        res.json({ success: true, data: conference });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/conference/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const conference = await Conference.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: conference });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/conference/rnd-action/:id
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

        const conference = await Conference.findByIdAndUpdate(id, updates, { new: true });

        res.json({ success: true, data: conference });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
