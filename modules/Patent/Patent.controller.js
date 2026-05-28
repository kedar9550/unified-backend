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
        if (!data.title || !data.patentName || !data.applyingSeedGrant || !data.dateOfFiling || !data.filingNo) {
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
            title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i'),
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingRecord) {
            return res.status(400).json({ 
                success: false, 
                message: "A patent entry with this title already exists and is either Pending or Approved. Duplicate submissions are not allowed." 
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

        const patent = new Patent({
            ...data,
            title: trimmedTitle,
            facultyId: req.user.userId,
            coInventors: parsedCoInventors,
            patentStatus: data.status, // Map 'status' from frontend to 'patentStatus' in model
            status: 'Pending at HOD'
        });

        if (req.files) {
            if (req.files.eFilingReceipt) patent.eFilingReceipt = `/uploads/patents/${req.files.eFilingReceipt[0].filename}`;
            if (req.files.form1) patent.form1 = `/uploads/patents/${req.files.form1[0].filename}`;
        }

        await patent.save();
        res.status(201).json({ success: true, data: patent });
    } catch (err) {
        console.error("Create Patent Error:", err);
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
            .populate('academicYear', 'year');
            
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
        const updates = { 
            status, 
            rndComment: comment 
        };
        
        if (approvedAmount !== undefined) {
            updates.approvedAmount = approvedAmount;
        }

        const patent = await Patent.findByIdAndUpdate(id, updates, { new: true });

        res.json({ success: true, data: patent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
