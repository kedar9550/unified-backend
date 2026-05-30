const FacultyProctoringEntry = require("./FacultyProctoringEntry.model");
const Employee = require("../employee/employee.model");
const AcademicYear = require("../academicYear/academicYear.model");
const { getHODDepartments } = require("../../utils/hodHelper");

// @desc    Submit or update manual proctoring statistics
// @route   POST /api/faculty-proctoring
// @access  Private (Faculty)
exports.createEntry = async (req, res) => {
    try {
        const { academicYear, totalStudents, studentsAppeared, studentsPassed } = req.body;
        const facultyId = req.user.userId;

        // Validation
        if (!academicYear) {
            return res.status(400).json({ success: false, message: "Academic Year is required." });
        }

        const total = parseInt(totalStudents);
        const appeared = parseInt(studentsAppeared);
        const passed = parseInt(studentsPassed);

        if (isNaN(total) || isNaN(appeared) || isNaN(passed)) {
            return res.status(400).json({ success: false, message: "Total, appeared, and passed counts must be valid numbers." });
        }

        if (total < 0 || appeared < 0 || passed < 0) {
            return res.status(400).json({ success: false, message: "Student counts cannot be negative." });
        }

        if (appeared > total) {
            return res.status(400).json({ success: false, message: "Number of students appeared cannot exceed total students under proctoring." });
        }

        if (passed > appeared) {
            return res.status(400).json({ success: false, message: "Number of students passed cannot exceed students appeared for examinations." });
        }

        // Calculate pass percentage
        const passPercentage = appeared > 0 
            ? parseFloat(((passed / appeared) * 100).toFixed(2)) 
            : 0;

        // Check if an entry already exists for this faculty and academic year
        let entry = await FacultyProctoringEntry.findOne({ facultyId, academicYear });

        if (entry) {
            if (entry.status === "Approved") {
                return res.status(400).json({ 
                    success: false, 
                    message: "This proctoring record has already been approved by your HOD and cannot be modified." 
                });
            }

            // If entry is Pending or Rejected, allow updating and reset to Pending status
            entry.totalStudents = total;
            entry.studentsAppeared = appeared;
            entry.studentsPassed = passed;
            entry.passPercentage = passPercentage;
            entry.status = "Pending";
            entry.approvedBy = null;
            entry.approvalDate = null;
            entry.remarks = ""; // clear previous rejection comments
            
            await entry.save();
        } else {
            // Create a new entry
            entry = new FacultyProctoringEntry({
                facultyId,
                academicYear,
                totalStudents: total,
                studentsAppeared: appeared,
                studentsPassed: passed,
                passPercentage,
                status: "Pending"
            });
            await entry.save();
        }

        res.status(201).json({ success: true, data: entry });
    } catch (err) {
        console.error("Create Proctoring Entry Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own proctoring entries
// @route   GET /api/faculty-proctoring/my-entries
// @access  Private (Faculty)
exports.getMyEntries = async (req, res) => {
    try {
        const entries = await FacultyProctoringEntry.find({ facultyId: req.user.userId })
            .populate("academicYear", "year")
            .populate("approvedBy", "name")
            .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        console.error("Get My Proctoring Entries Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get proctoring requests pending review for HOD's department
// @route   GET /api/faculty-proctoring/pending-hod
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

        // Find all proctoring entries for these faculty
        // Let's retrieve all of them so HOD can filter by Pending/Approved/Rejected on the frontend!
        const entries = await FacultyProctoringEntry.find({ 
            facultyId: { $in: facultyIds }
        })
        .populate("facultyId", "name institutionId department coreDepartment")
        .populate("academicYear", "year")
        .populate("approvedBy", "name")
        .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        console.error("Get Pending Proctoring Entries Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD action (Approve/Reject) on proctoring statistics
// @route   PUT /api/faculty-proctoring/hod-action/:id
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

        const entry = await FacultyProctoringEntry.findByIdAndUpdate(id, updates, { new: true })
            .populate("facultyId", "name institutionId")
            .populate("academicYear", "year")
            .populate("approvedBy", "name");

        if (!entry) {
            return res.status(404).json({ success: false, message: "Proctoring entry not found." });
        }

        res.json({ success: true, data: entry });
    } catch (err) {
        console.error("HOD Proctoring Action Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
