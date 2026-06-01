const FacultyAdministration = require("./FacultyAdministration.model");
const Employee = require("../employee/employee.model");
const AcademicYear = require("../academicYear/academicYear.model");
const { getHODDepartments } = require("../../utils/hodHelper");

// @desc    Submit or update administrative roles
// @route   POST /api/faculty-administration
// @access  Private (Faculty)
exports.createOrUpdateEntry = async (req, res) => {
    try {
        const { academicYear, roles } = req.body;
        const facultyId = req.user.userId;

        if (!academicYear) {
            return res.status(400).json({ success: false, message: "Academic Year is required." });
        }

        if (!roles || !Array.isArray(roles)) {
            return res.status(400).json({ success: false, message: "Roles data is required." });
        }

        // Check if an entry already exists for this faculty and academic year
        let entry = await FacultyAdministration.findOne({ facultyId, academicYear });

        if (entry) {
            // Update details and reset to Pending
            entry.roles = roles;
            entry.status = "Pending";
            entry.approvedBy = null;
            entry.approvalDate = null;
            entry.remarks = ""; // clear previous remarks

            await entry.save();
        } else {
            // Create a new entry
            entry = new FacultyAdministration({
                facultyId,
                academicYear,
                roles,
                status: "Pending"
            });
            await entry.save();
        }

        res.status(201).json({ success: true, data: entry });
    } catch (err) {
        console.error("Create/Update Faculty Administration Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own administration role declarations
// @route   GET /api/faculty-administration/my-entries
// @access  Private (Faculty)
exports.getMyEntries = async (req, res) => {
    try {
        const entries = await FacultyAdministration.find({ facultyId: req.user.userId })
            .populate("academicYear", "year")
            .populate("approvedBy", "name")
            .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        console.error("Get My Administration Entries Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get administration declarations for HOD's department
// @route   GET /api/faculty-administration/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        const deptIds = await getHODDepartments(req.user);

        if (!deptIds || deptIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // Find all faculty belonging to HOD's department(s)
        const facultyIds = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ]
        }).distinct("_id");

        // Find all administration entries for these faculty
        const entries = await FacultyAdministration.find({
            facultyId: { $in: facultyIds }
        })
        .populate("facultyId", "name institutionId department coreDepartment")
        .populate("academicYear", "year")
        .populate("approvedBy", "name")
        .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        console.error("Get Department Faculty Administration Entries Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD action (Approve/Reject) on administration declaration
// @route   PUT /api/faculty-administration/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, remarks } = req.body; // action: "Approve" or "Reject"

        if (!action || !["Approve", "Reject"].includes(action)) {
            return res.status(400).json({ success: false, message: "Action must be either Approve or Reject." });
        }

        const status = action === "Approve" ? "Approved" : "Rejected";

        const updates = {
            status,
            approvedBy: req.user.userId,
            approvalDate: new Date(),
            remarks: remarks || ""
        };

        const entry = await FacultyAdministration.findByIdAndUpdate(id, updates, { new: true })
            .populate("facultyId", "name institutionId")
            .populate("academicYear", "year")
            .populate("approvedBy", "name");

        if (!entry) {
            return res.status(404).json({ success: false, message: "Administration roles entry not found." });
        }

        res.json({ success: true, data: entry });
    } catch (err) {
        console.error("HOD Administration Action Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
