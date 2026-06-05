const NovelProduct = require('./NovelProduct.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Submit new Novel Product / Technology developed or implemented
// @route   POST /api/research/novel-product
// @access  Private (Faculty)
exports.createNovelProduct = async (req, res) => {
    try {
        const data = req.body;

        // 1. Mandatory Fields Validation
        if (!data.productName || !data.description || !data.category || !data.academicYear) {
            return res.status(400).json({ success: false, message: "Please fill all mandatory fields." });
        }

        // 2. Implemented category requires Organization Name
        if (data.category === 'Implemented' && (!data.organizationName || !data.organizationName.trim())) {
            return res.status(400).json({ 
                success: false, 
                message: "Organization Name is mandatory when category is 'Implemented'." 
            });
        }

        // 3. Supporting Document check
        if (!req.file) {
            return res.status(400).json({ success: false, message: "At least one supporting document/proof is mandatory." });
        }

        // 4. Duplicate checks
        const existingRecord = await NovelProduct.findOne({
            facultyId: req.user.userId,
            academicYear: data.academicYear,
            productName: new RegExp(`^${escapeRegex(data.productName.trim())}$`, 'i'),
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingRecord) {
            return res.status(400).json({
                success: false,
                message: "You have already submitted a pending or approved entry for this Product/Technology in this academic year."
            });
        }

        let parsedCoDevelopers = [];
        if (typeof data.coDevelopers === 'string') {
            try {
                parsedCoDevelopers = JSON.parse(data.coDevelopers);
            } catch (e) {
                parsedCoDevelopers = [];
            }
        } else if (Array.isArray(data.coDevelopers)) {
            parsedCoDevelopers = data.coDevelopers;
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoDevelopers, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        const product = new NovelProduct({
            facultyId: req.user.userId,
            academicYear: data.academicYear,
            productName: data.productName.trim(),
            description: data.description.trim(),
            category: data.category,
            organizationName: data.category === 'Implemented' ? data.organizationName.trim() : undefined,
            document: `/uploads/novelProducts/${req.file.filename}`,
            remarks: data.remarks ? data.remarks.trim() : undefined,
            principalInvestigator: data.principalInvestigator || 'Yes',
            coDevelopers: resolvedAuthors,
            applyIncentive: data.applyIncentive || 'No',
            appraisalClaimant,
            status: 'Pending at HOD'
        });

        await product.save();
        res.status(201).json({ success: true, data: product });
    } catch (err) {
        console.error("Create NovelProduct Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own Novel Product entries
// @route   GET /api/research/novel-product
// @access  Private (Faculty)
exports.getMyNovelProducts = async (req, res) => {
    try {
        const products = await NovelProduct.find({
            $or: [
                { facultyId: req.user.userId },
                { 'coDevelopers.employeeId': req.user.userId }
            ]
        })
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .populate('coDevelopers.employeeId', 'name institutionId')
            .sort({ createdAt: -1 });

        const list = products.map(p => {
            const obj = p.toObject();
            if (p.facultyId && p.facultyId._id.toString() !== req.user.userId.toString()) {
                obj.visibilityRole = "Co-Developer";
            } else {
                obj.visibilityRole = "Applicant";
            }
            return obj;
        });

        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get Novel Product by ID
// @route   GET /api/research/novel-product/:id
// @access  Private
exports.getNovelProductById = async (req, res) => {
    try {
        const product = await NovelProduct.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('coDevelopers.employeeId', 'name institutionId')
            .populate('academicYear', 'year');
            
        if (!product) {
            return res.status(404).json({ success: false, message: 'Novel Product / Technology not found' });
        }
        res.json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get pending Novel Products at HOD
// @route   GET /api/research/novel-product/pending-hod
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
        
        const products = await NovelProduct.find({ 
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');
        
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/novel-product/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const product = await NovelProduct.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get pending Novel Products at R&D
// @route   GET /api/research/novel-product/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const products = await NovelProduct.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/novel-product/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const product = await NovelProduct.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Novel Product / Technology not found' });
        }

        product.status = status;
        product.rndComment = comment;

        if (status === 'Approved' && (product.applyIncentive === 'Yes' || product.applyIncentive === 'yes') && product.appraisalClaimant) {
            product.incentiveClaimant = product.appraisalClaimant;
        }

        await product.save();
        res.json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
