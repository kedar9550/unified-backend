const ResourceUtilization = require('./ResourceUtilization.model');
const Employee = require('../employee/employee.model');
const { isFutureDate } = require('../../utils/validationHelper');
const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Submit new resource utilization activity (saves as Draft by default)
// @route   POST /api/value-addition/resource-utilization
// @access  Private (Faculty)
exports.createResourceUtilization = async (req, res) => {
    try {
        const data = req.body;

        // Validate mandatory text fields
        if (!data.academicYear || !data.activityCategory || !data.activityType || !data.organizationName || !data.fromDate || !data.toDate) {
            return res.status(400).json({ success: false, message: "Please fill all required fields." });
        }

        // Validate role-specific mandatory fields
        if (data.activityType && data.activityType.includes("Resource Person") && !data.sessionsConducted) {
            return res.status(400).json({ success: false, message: "Number of Sessions Conducted is required for Resource Person role." });
        }
        if (data.activityType && data.activityType.includes("Participant") && !data.daysParticipated) {
            return res.status(400).json({ success: false, message: "Number of Days Participated is required for Participant role." });
        }

        // Validate duplicates (same organization/event name in same category and academic year unless rejected)
        if (data.organizationName) {
            const existing = await ResourceUtilization.findOne({
                facultyId: req.user.userId,
                academicYear: data.academicYear,
                activityCategory: data.activityCategory,
                organizationName: { $regex: new RegExp("^" + data.organizationName.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                status: { $ne: 'Rejected' }
            });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A duplicate entry for this academic year and activity category already exists with the same organization/event name: "${data.organizationName}".`
                });
            }
        }

        // Validate proof upload
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Relevant proof upload is mandatory." });
        }

        // Validate file size (500KB limit)
        if (req.file.size > 500 * 1024) {
            return res.status(400).json({
                success: false,
                message: `Proof document is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.`
            });
        }

        // Validate dates (not in future)
        if (isFutureDate(data.fromDate) || isFutureDate(data.toDate)) {
            return res.status(400).json({ success: false, message: "Activity dates cannot be in the future." });
        }

        if (new Date(data.fromDate) >= new Date(data.toDate)) {
            return res.status(400).json({ success: false, message: "To Date must be greater than From Date." });
        }

        // Auto-calculate duration in days
        const start = new Date(data.fromDate);
        const end = new Date(data.toDate);
        const diffTime = Math.abs(end - start);
        const calcDuration = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

        const resourceUtilization = new ResourceUtilization({
            facultyId: req.user.userId,
            academicYear: data.academicYear,
            activityCategory: data.activityCategory,
            activityType: data.activityType,
            organizationName: data.organizationName,
            fromDate: data.fromDate,
            toDate: data.toDate,
            duration: calcDuration,
            remarks: data.remarks || "",
            sessionsConducted: data.sessionsConducted ? parseInt(data.sessionsConducted) : undefined,
            daysParticipated: data.daysParticipated ? parseInt(data.daysParticipated) : undefined,
            proof: `/uploads/resource-utilization/${req.file.filename}`,
            status: 'Draft' // Always save as Draft first
        });

        await resourceUtilization.save();
        res.status(201).json({ success: true, data: resourceUtilization });
    } catch (err) {
        console.error("Create Resource Utilization Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own resource utilization entries (optional filtering by academicYear)
// @route   GET /api/value-addition/resource-utilization
// @access  Private (Faculty)
exports.getMyResourceUtilizations = async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        if (req.query.academicYear) {
            query.academicYear = req.query.academicYear;
        }

        const list = await ResourceUtilization.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update resource utilization entry (only if status is Draft)
// @route   PUT /api/value-addition/resource-utilization/:id
// @access  Private (Faculty)
exports.updateResourceUtilization = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const record = await ResourceUtilization.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        if (record.facultyId.toString() !== req.user.userId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to update this record." });
        }

        if (record.status !== 'Draft') {
            return res.status(400).json({ success: false, message: "Submitted, Approved, or Rejected entries cannot be edited." });
        }

        // Validate dates if sent
        if (data.fromDate && isFutureDate(data.fromDate)) {
            return res.status(400).json({ success: false, message: "From Date cannot be in the future." });
        }
        if (data.toDate && isFutureDate(data.toDate)) {
            return res.status(400).json({ success: false, message: "To Date cannot be in the future." });
        }
        const from = data.fromDate || record.fromDate;
        const to = data.toDate || record.toDate;
        if (from && to && new Date(from) >= new Date(to)) {
            return res.status(400).json({ success: false, message: "To Date must be greater than From Date." });
        }

        // Validate role-specific mandatory fields
        const type = data.activityType || record.activityType;
        const days = data.daysParticipated !== undefined ? data.daysParticipated : record.daysParticipated;
        const sessions = data.sessionsConducted !== undefined ? data.sessionsConducted : record.sessionsConducted;

        if (type && type.includes("Resource Person") && !sessions) {
            return res.status(400).json({ success: false, message: "Number of Sessions Conducted is required for Resource Person role." });
        }
        if (type && type.includes("Participant") && !days) {
            return res.status(400).json({ success: false, message: "Number of Days Participated is required for Participant role." });
        }

        // Validate duplicates (same organization/event name in same category and academic year unless rejected)
        const category = data.activityCategory || record.activityCategory;
        const orgName = data.organizationName || record.organizationName;
        const academicYearVal = data.academicYear || record.academicYear;
        if (orgName) {
            const existing = await ResourceUtilization.findOne({
                _id: { $ne: id },
                facultyId: req.user.userId,
                academicYear: academicYearVal,
                activityCategory: category,
                organizationName: { $regex: new RegExp("^" + orgName.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                status: { $ne: 'Rejected' }
            });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A duplicate entry for this academic year and activity category already exists with the same organization/event name: "${orgName}".`
                });
            }
        }

        // Auto-calculate duration in days
        const start = new Date(from);
        const end = new Date(to);
        const diffTime = Math.abs(end - start);
        const duration = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

        // Update fields
        record.academicYear = data.academicYear || record.academicYear;
        record.activityCategory = data.activityCategory || record.activityCategory;
        record.activityType = data.activityType || record.activityType;
        record.organizationName = data.organizationName || record.organizationName;
        record.fromDate = from;
        record.toDate = to;
        record.duration = duration;
        record.remarks = data.remarks !== undefined ? data.remarks : record.remarks;
        record.sessionsConducted = data.sessionsConducted !== undefined ? (data.sessionsConducted ? parseInt(data.sessionsConducted) : undefined) : record.sessionsConducted;
        record.daysParticipated = data.daysParticipated !== undefined ? (data.daysParticipated ? parseInt(data.daysParticipated) : undefined) : record.daysParticipated;

        if (req.file) {
            if (req.file.size > 500 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: `Proof document is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.`
                });
            }
            record.proof = `/uploads/resource-utilization/${req.file.filename}`;
        }

        await record.save();
        res.json({ success: true, data: record });
    } catch (err) {
        console.error("Update Resource Utilization Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Delete resource utilization entry (only if status is Draft)
// @route   DELETE /api/value-addition/resource-utilization/:id
// @access  Private (Faculty)
exports.deleteResourceUtilization = async (req, res) => {
    try {
        const { id } = req.params;
        const record = await ResourceUtilization.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        if (record.facultyId.toString() !== req.user.userId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to delete this record." });
        }

        if (record.status !== 'Draft') {
            return res.status(400).json({ success: false, message: "Only draft entries can be deleted." });
        }

        await ResourceUtilization.findByIdAndDelete(id);
        res.json({ success: true, message: "Record deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Bulk submit all drafts of an academic year
// @route   POST /api/value-addition/resource-utilization/submit-academic-year
// @access  Private (Faculty)
exports.submitAcademicYear = async (req, res) => {
    try {
        const { academicYear } = req.body;
        const query = { facultyId: req.user.userId, status: 'Draft' };
        if (academicYear) {
            query.academicYear = academicYear;
        }

        const result = await ResourceUtilization.updateMany(
            query,
            { status: 'Pending at HOD' }
        );

        res.json({
            success: true,
            message: `Successfully submitted ${result.modifiedCount} activities for approval.`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get entries for HOD's department (filters: status, academicYear)
// @route   GET /api/value-addition/resource-utilization/pending-hod
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

        // Only show Pending at HOD, Approved, or Rejected records to HOD (exclude Drafts!)
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

        const list = await ResourceUtilization.find(query)
            .populate('facultyId', 'name institutionId department coreDepartment profileImage')
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD action (Approve / Reject)
// @route   PUT /api/value-addition/resource-utilization/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        if (!action || !['Approve', 'Reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Please specify a valid action (Approve or Reject)." });
        }

        const record = await ResourceUtilization.findById(id);
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
// @route   POST /api/value-addition/resource-utilization/hod-bulk-action
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

        await ResourceUtilization.updateMany(
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
