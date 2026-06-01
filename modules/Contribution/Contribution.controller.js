const Contribution = require('./Contribution.model');
const Employee = require('../employee/employee.model');
const { isFutureDate } = require('../../utils/validationHelper');
const { getHODDepartments } = require('../../utils/hodHelper');

// Validate fields based on Category
const validateCategoryFields = (category, data) => {
    const cat = parseInt(category);
    switch (cat) {
        case 1:
            if (!data.organizationName || !data.fromDate || !data.toDate) {
                return "Organization Name, From Date, and To Date are mandatory for Category 1.";
            }
            if (new Date(data.fromDate) >= new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate)) {
                return "From Date cannot be in the future.";
            }
            break;
        case 2:
            if (!data.journalName || !data.fromDate || !data.toDate) {
                return "Journal Name, From Date, and To Date are mandatory for Category 2.";
            }
            if (new Date(data.fromDate) >= new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate)) {
                return "From Date cannot be in the future.";
            }
            break;
        case 3:
            if (!data.journalConferenceName || !data.fromDate || !data.toDate) {
                return "Journal/Conference Name, From Date, and To Date are mandatory for Category 3.";
            }
            if (new Date(data.fromDate) >= new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate)) {
                return "From Date cannot be in the future.";
            }
            break;
        case 4:
        case 5:
            if (!data.awardName || !data.awardDate) {
                return "Award Name and Award Date are mandatory.";
            }
            if (isFutureDate(data.awardDate)) {
                return "Award Date cannot be in the future.";
            }
            break;
        case 6:
            if (!data.courseName || !data.url) {
                return "Course Name and URL are mandatory.";
            }
            break;
        case 7:
            if (!data.certificationName || !data.fromDate || !data.toDate) {
                return "Certification Name, From Date, and To Date are mandatory.";
            }
            if (new Date(data.fromDate) >= new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate) || isFutureDate(data.toDate)) {
                return "Dates cannot be in the future.";
            }
            break;
        case 8:
            if (!data.eventName || !data.eventDate) {
                return "Event Name and Event Date are mandatory.";
            }
            if (isFutureDate(data.eventDate)) {
                return "Event Date cannot be in the future.";
            }
            break;
        case 9:
            if (!data.articleTitle || !data.publicationName || !data.publicationDate) {
                return "Article Title, Publication Name, and Publication Date are mandatory.";
            }
            if (isFutureDate(data.publicationDate)) {
                return "Publication Date cannot be in the future.";
            }
            break;
        case 10:
            if (!data.facilityName || !data.fromDate || !data.toDate) {
                return "Facility Name, From Date, and To Date are mandatory.";
            }
            if (new Date(data.fromDate) >= new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate) || isFutureDate(data.toDate)) {
                return "Dates cannot be in the future.";
            }
            break;
        case 11:
            if (!data.courseName || !data.duration) {
                return "Course Name and Duration are mandatory.";
            }
            if (!["12 Weeks", "8 Weeks", "4 Weeks"].includes(data.duration)) {
                return "Invalid duration selected. Must be '12 Weeks', '8 Weeks', or '4 Weeks'.";
            }
            break;
        case 12:
            if (!data.courseName || !data.fromDate || !data.toDate) {
                return "Course Name, From Date, and To Date are mandatory.";
            }
            if (new Date(data.fromDate) >= new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate) || isFutureDate(data.toDate)) {
                return "Dates cannot be in the future.";
            }
            break;
        case 13:
            if (!data.grantName || !data.fromDate || !data.toDate) {
                return "Grant Name, From Date, and To Date are mandatory.";
            }
            if (new Date(data.fromDate) >= new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate) || isFutureDate(data.toDate)) {
                return "Dates cannot be in the future.";
            }
            break;
        default:
            return "Invalid Category selected.";
    }
    return null;
};

// Helper to get the unique name/description field by Category for duplicate checks
const getContributionNameField = (category, data) => {
    const cat = parseInt(category);
    switch (cat) {
        case 1: return { field: 'organizationName', value: data.organizationName };
        case 2: return { field: 'journalName', value: data.journalName };
        case 3: return { field: 'journalConferenceName', value: data.journalConferenceName };
        case 4:
        case 5: return { field: 'awardName', value: data.awardName };
        case 6: return { field: 'courseName', value: data.courseName };
        case 7: return { field: 'certificationName', value: data.certificationName };
        case 8: return { field: 'eventName', value: data.eventName };
        case 9: return { field: 'articleTitle', value: data.articleTitle };
        case 10: return { field: 'facilityName', value: data.facilityName };
        case 11:
        case 12: return { field: 'courseName', value: data.courseName };
        case 13: return { field: 'grantName', value: data.grantName };
        default: return { field: '', value: '' };
    }
};

// @desc    Submit new faculty contribution entry (saves as Draft by default)
// @route   POST /api/value-addition/contribution
// @access  Private (Faculty)
exports.createContribution = async (req, res) => {
    try {
        const data = req.body;

        if (!data.academicYear || !data.category) {
            return res.status(400).json({ success: false, message: "Academic Year and Category are mandatory." });
        }

        // Validate proof upload
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Proof document upload is mandatory." });
        }

        // Validate file size (500KB limit)
        if (req.file.size > 500 * 1024) {
            return res.status(400).json({
                success: false,
                message: `Proof document is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.`
            });
        }

        // Field validations per category
        const validationError = validateCategoryFields(data.category, data);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const categoryNum = parseInt(data.category);

        // Validate duplicates (same name/title in same category and academic year unless rejected)
        const { field, value } = getContributionNameField(data.category, data);
        if (field && value) {
            const query = {
                facultyId: req.user.userId,
                academicYear: data.academicYear,
                category: categoryNum,
                [field]: { $regex: new RegExp("^" + value.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                status: { $ne: 'Rejected' }
            };
            const existing = await Contribution.findOne(query);
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A duplicate entry for this academic year and category already exists with the same name: "${value}".`
                });
            }
        }

        const contribution = new Contribution({
            facultyId: req.user.userId,
            academicYear: data.academicYear,
            category: categoryNum,
            
            // Populate matching category fields
            organizationName: categoryNum === 1 ? data.organizationName : undefined,
            fromDate: [1, 2, 3, 7, 10, 12, 13].includes(categoryNum) ? data.fromDate : undefined,
            toDate: [1, 2, 3, 7, 10, 12, 13].includes(categoryNum) ? data.toDate : undefined,
            
            journalName: categoryNum === 2 ? data.journalName : (categoryNum === 3 ? data.journalConferenceName : undefined),
            journalConferenceName: categoryNum === 3 ? data.journalConferenceName : undefined,
            
            duration: [1, 2, 3, 7, 10, 11, 12, 13].includes(categoryNum) ? data.duration : undefined,
            
            awardName: [4, 5].includes(categoryNum) ? data.awardName : undefined,
            awardDate: [4, 5].includes(categoryNum) ? data.awardDate : undefined,
            
            courseName: [6, 11, 12].includes(categoryNum) ? data.courseName : undefined,
            url: categoryNum === 6 ? data.url : undefined,
            
            certificationName: categoryNum === 7 ? data.certificationName : undefined,
            
            eventName: categoryNum === 8 ? data.eventName : undefined,
            eventDate: categoryNum === 8 ? data.eventDate : undefined,
            
            articleTitle: categoryNum === 9 ? data.articleTitle : undefined,
            publicationName: categoryNum === 9 ? data.publicationName : undefined,
            publicationDate: categoryNum === 9 ? data.publicationDate : undefined,
            
            facilityName: categoryNum === 10 ? data.facilityName : undefined,
            
            grantName: categoryNum === 13 ? data.grantName : undefined,
            
            proof: `/uploads/contributions/${req.file.filename}`,
            status: 'Draft' // Always save as Draft first
        });

        await contribution.save();
        res.status(201).json({ success: true, data: contribution });
    } catch (err) {
        console.error("Create Contribution Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get own contributions (optional filtering by academicYear)
// @route   GET /api/value-addition/contribution
// @access  Private (Faculty)
exports.getMyContributions = async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        if (req.query.academicYear) {
            query.academicYear = req.query.academicYear;
        }

        const list = await Contribution.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update contribution (only if status is Draft)
// @route   PUT /api/value-addition/contribution/:id
// @access  Private (Faculty)
exports.updateContribution = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const record = await Contribution.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        if (record.facultyId.toString() !== req.user.userId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to update this record." });
        }

        if (record.status !== 'Draft') {
            return res.status(400).json({ success: false, message: "Submitted, Approved, or Rejected entries cannot be edited." });
        }

        // Validate fields for selected category
        const categoryVal = data.category || record.category;
        const validationError = validateCategoryFields(categoryVal, { ...record.toObject(), ...data });
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const categoryNum = parseInt(categoryVal);

        // Validate duplicates (same name/title in same category and academic year unless rejected)
        const { field, value } = getContributionNameField(categoryNum, { ...record.toObject(), ...data });
        if (field && value) {
            const query = {
                _id: { $ne: id },
                facultyId: req.user.userId,
                academicYear: data.academicYear || record.academicYear,
                category: categoryNum,
                [field]: { $regex: new RegExp("^" + value.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                status: { $ne: 'Rejected' }
            };
            const existing = await Contribution.findOne(query);
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A duplicate entry for this academic year and category already exists with the same name: "${value}".`
                });
            }
        }

        // Update fields dynamically
        record.academicYear = data.academicYear || record.academicYear;
        record.category = categoryNum;

        // Clear other fields to maintain schema purity
        record.organizationName = categoryNum === 1 ? (data.organizationName || record.organizationName) : undefined;
        record.fromDate = [1, 2, 3, 7, 10, 12, 13].includes(categoryNum) ? (data.fromDate || record.fromDate) : undefined;
        record.toDate = [1, 2, 3, 7, 10, 12, 13].includes(categoryNum) ? (data.toDate || record.toDate) : undefined;
        
        record.journalName = categoryNum === 2 ? (data.journalName || record.journalName) : (categoryNum === 3 ? (data.journalConferenceName || record.journalConferenceName) : undefined);
        record.journalConferenceName = categoryNum === 3 ? (data.journalConferenceName || record.journalConferenceName) : undefined;
        
        record.duration = [1, 2, 3, 7, 10, 11, 12, 13].includes(categoryNum) ? (data.duration || record.duration) : undefined;
        
        record.awardName = [4, 5].includes(categoryNum) ? (data.awardName || record.awardName) : undefined;
        record.awardDate = [4, 5].includes(categoryNum) ? (data.awardDate || record.awardDate) : undefined;
        
        record.courseName = [6, 11, 12].includes(categoryNum) ? (data.courseName || record.courseName) : undefined;
        record.url = categoryNum === 6 ? (data.url || record.url) : undefined;
        
        record.certificationName = categoryNum === 7 ? (data.certificationName || record.certificationName) : undefined;
        
        record.eventName = categoryNum === 8 ? (data.eventName || record.eventName) : undefined;
        record.eventDate = categoryNum === 8 ? (data.eventDate || record.eventDate) : undefined;
        
        record.articleTitle = categoryNum === 9 ? (data.articleTitle || record.articleTitle) : undefined;
        record.publicationName = categoryNum === 9 ? (data.publicationName || record.publicationName) : undefined;
        record.publicationDate = categoryNum === 9 ? (data.publicationDate || record.publicationDate) : undefined;
        
        record.facilityName = categoryNum === 10 ? (data.facilityName || record.facilityName) : undefined;
        
        record.grantName = categoryNum === 13 ? (data.grantName || record.grantName) : undefined;

        if (req.file) {
            if (req.file.size > 500 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: `Proof document is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.`
                });
            }
            record.proof = `/uploads/contributions/${req.file.filename}`;
        }

        await record.save();
        res.json({ success: true, data: record });
    } catch (err) {
        console.error("Update Contribution Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Delete contribution (only if status is Draft)
// @route   DELETE /api/value-addition/contribution/:id
// @access  Private (Faculty)
exports.deleteContribution = async (req, res) => {
    try {
        const { id } = req.params;
        const record = await Contribution.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        if (record.facultyId.toString() !== req.user.userId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to delete this record." });
        }

        if (record.status !== 'Draft') {
            return res.status(400).json({ success: false, message: "Only draft entries can be deleted." });
        }

        await Contribution.findByIdAndDelete(id);
        res.json({ success: true, message: "Record deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Bulk submit all drafts of an academic year
// @route   POST /api/value-addition/contribution/submit-academic-year
// @access  Private (Faculty)
exports.submitAcademicYear = async (req, res) => {
    try {
        const { academicYear } = req.body;
        const query = { facultyId: req.user.userId, status: 'Draft' };
        if (academicYear) {
            query.academicYear = academicYear;
        }

        const result = await Contribution.updateMany(
            query,
            { status: 'Pending at HOD' }
        );

        res.json({
            success: true,
            message: `Successfully submitted ${result.modifiedCount} contributions for approval.`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get pending entries for HOD (exclude Drafts!)
// @route   GET /api/value-addition/contribution/pending-hod
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

        const query = {
            facultyId: { $in: facultyIds },
            status: { $in: ['Pending at HOD', 'Approved', 'Rejected'] }
        };

        if (req.query.status && req.query.status !== 'All') {
            query.status = req.query.status;
        }

        if (req.query.academicYear) {
            query.academicYear = req.query.academicYear;
        }

        if (req.query.category && req.query.category !== 'All') {
            query.category = parseInt(req.query.category);
        }

        const list = await Contribution.find(query)
            .populate('facultyId', 'name institutionId department coreDepartment profileImage')
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD action (Approve / Reject)
// @route   PUT /api/value-addition/contribution/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        if (!action || !['Approve', 'Reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Please specify a valid action (Approve or Reject)." });
        }

        const record = await Contribution.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        record.status = action === 'Approve' ? 'Approved' : 'Rejected';
        record.hodComment = comment || "";

        await record.save();
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD bulk action (Approve / Reject Selected)
// @route   POST /api/value-addition/contribution/hod-bulk-action
// @access  Private (HOD)
exports.bulkHODAction = async (req, res) => {
    try {
        const { ids, action, comment } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: "A list of entry IDs is required." });
        }
        if (!action || !['Approve', 'Reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Please specify a valid action (Approve or Reject)." });
        }

        const status = action === 'Approve' ? 'Approved' : 'Rejected';
        const updateData = { status, hodComment: comment || "" };

        await Contribution.updateMany(
            { _id: { $in: ids } },
            updateData
        );

        res.json({
            success: true,
            message: `Successfully processed ${ids.length} entries as ${action === 'Approve' ? 'Approved' : 'Rejected'}.`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
