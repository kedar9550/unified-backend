const FacultyProctoringEntry = require("./FacultyProctoringEntry.model");
const Employee = require("../employee/employee.model");
const AcademicYear = require("../academicYear/academicYear.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const { getHODDepartments } = require("../../utils/hodHelper");

// @desc    Submit a new manual proctoring record
// @route   POST /api/faculty-proctoring
// @access  Private (Faculty)
exports.createEntry = async (req, res) => {
    try {
        const {
            academicYear,
            programId,
            branchId,
            semesterNumber,
            yearNumber,
            section,
            totalStudents,
            eligibleStudents,
            passedStudents
        } = req.body;
        const facultyId = req.user.userId;

        // Validations
        if (!academicYear) {
            return res.status(400).json({ success: false, message: "Academic Year is required." });
        }
        if (!programId) {
            return res.status(400).json({ success: false, message: "Program is required." });
        }
        if (!branchId) {
            return res.status(400).json({ success: false, message: "Branch is required." });
        }
        if (section === undefined || section === "") {
            return res.status(400).json({ success: false, message: "Section is required." });
        }

        const secNum = parseInt(section);
        if (isNaN(secNum) || secNum < 1) {
            return res.status(400).json({ success: false, message: "Section must be a positive number." });
        }

        const total = parseInt(totalStudents);
        const eligible = parseInt(eligibleStudents);
        const passed = parseInt(passedStudents);

        if (isNaN(total) || isNaN(eligible) || isNaN(passed)) {
            return res.status(400).json({ success: false, message: "Student counts must be valid numbers." });
        }

        if (total < 0 || eligible < 0 || passed < 0) {
            return res.status(400).json({ success: false, message: "Student counts cannot be negative." });
        }

        if (eligible > total) {
            return res.status(400).json({ success: false, message: "Number of eligible students cannot exceed total allotted students." });
        }

        if (passed > eligible) {
            return res.status(400).json({ success: false, message: "Number of passed students cannot exceed eligible students." });
        }

        // Program configuration check for semester or year
        const program = await Program.findById(programId);
        if (!program) {
            return res.status(404).json({ success: false, message: "Selected Program not found." });
        }

        let semVal = null;
        let yrVal = null;
        if (program.programPattern === "YEAR") {
            if (!yearNumber || isNaN(parseInt(yearNumber))) {
                return res.status(400).json({ success: false, message: "Year number is required and must be a number for year-type programs." });
            }
            yrVal = parseInt(yearNumber);
        } else {
            if (!semesterNumber || isNaN(parseInt(semesterNumber))) {
                return res.status(400).json({ success: false, message: "Semester number is required and must be a number for semester-type programs." });
            }
            semVal = parseInt(semesterNumber);
        }

        // Branch verification
        const branch = await Branch.findById(branchId);
        if (!branch) {
            return res.status(404).json({ success: false, message: "Selected Branch not found." });
        }

        // Check for duplicates
        const duplicate = await FacultyProctoringEntry.findOne({
            facultyId,
            academicYear,
            programId,
            branchId,
            semesterNumber: semVal,
            yearNumber: yrVal,
            section: secNum
        });

        if (duplicate) {
            return res.status(400).json({
                success: false,
                message: `A proctoring record for Program: ${program.code}, Branch: ${branch.code}, Sem/Year: ${semVal || yrVal}, Sec: ${secNum} already exists.`
            });
        }

        // Calculate pass percentage
        const passPercentage = eligible > 0
            ? parseFloat(((passed / eligible) * 100).toFixed(2))
            : 0;

        const newEntry = new FacultyProctoringEntry({
            facultyId,
            academicYear,
            programId,
            branchId,
            semesterNumber: semVal,
            yearNumber: yrVal,
            section: secNum,
            totalStudents: total,
            eligibleStudents: eligible,
            passedStudents: passed,
            passPercentage,
            status: "Pending"
        });

        await newEntry.save();
        res.status(201).json({ success: true, data: newEntry });
    } catch (err) {
        console.error("Create Proctoring Entry Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update a proctoring entry
// @route   PUT /api/faculty-proctoring/:id
// @access  Private (Faculty owner only)
exports.updateEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            programId,
            branchId,
            semesterNumber,
            yearNumber,
            section,
            totalStudents,
            eligibleStudents,
            passedStudents
        } = req.body;
        const facultyId = req.user.userId;

        const entry = await FacultyProctoringEntry.findById(id);
        if (!entry) {
            return res.status(404).json({ success: false, message: "Proctoring entry not found." });
        }

        if (entry.facultyId.toString() !== facultyId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to edit this entry." });
        }

        if (entry.status === "Approved") {
            return res.status(400).json({ success: false, message: "Approved proctoring entries cannot be modified." });
        }

        // Validations
        if (!programId) {
            return res.status(400).json({ success: false, message: "Program is required." });
        }
        if (!branchId) {
            return res.status(400).json({ success: false, message: "Branch is required." });
        }
        if (section === undefined || section === "") {
            return res.status(400).json({ success: false, message: "Section is required." });
        }

        const secNum = parseInt(section);
        if (isNaN(secNum) || secNum < 1) {
            return res.status(400).json({ success: false, message: "Section must be a positive number." });
        }

        const total = parseInt(totalStudents);
        const eligible = parseInt(eligibleStudents);
        const passed = parseInt(passedStudents);

        if (isNaN(total) || isNaN(eligible) || isNaN(passed)) {
            return res.status(400).json({ success: false, message: "Student counts must be valid numbers." });
        }

        if (total < 0 || eligible < 0 || passed < 0) {
            return res.status(400).json({ success: false, message: "Student counts cannot be negative." });
        }

        if (eligible > total) {
            return res.status(400).json({ success: false, message: "Number of eligible students cannot exceed total allotted students." });
        }

        if (passed > eligible) {
            return res.status(400).json({ success: false, message: "Number of passed students cannot exceed eligible students." });
        }

        // Program configuration check
        const program = await Program.findById(programId);
        if (!program) {
            return res.status(404).json({ success: false, message: "Selected Program not found." });
        }

        let semVal = null;
        let yrVal = null;
        if (program.programPattern === "YEAR") {
            if (!yearNumber || isNaN(parseInt(yearNumber))) {
                return res.status(400).json({ success: false, message: "Year number is required and must be a number for year-type programs." });
            }
            yrVal = parseInt(yearNumber);
        } else {
            if (!semesterNumber || isNaN(parseInt(semesterNumber))) {
                return res.status(400).json({ success: false, message: "Semester number is required and must be a number for semester-type programs." });
            }
            semVal = parseInt(semesterNumber);
        }

        // Check duplicate excluding itself
        const duplicate = await FacultyProctoringEntry.findOne({
            _id: { $ne: id },
            facultyId,
            academicYear: entry.academicYear,
            programId,
            branchId,
            semesterNumber: semVal,
            yearNumber: yrVal,
            section: secNum
        });

        if (duplicate) {
            return res.status(400).json({
                success: false,
                message: `Another proctoring record for Program Code: ${program.code}, Branch Code: ${branchId}, Sem/Year: ${semVal || yrVal}, Sec: ${secNum} already exists.`
            });
        }

        // Calculate pass percentage
        const passPercentage = eligible > 0
            ? parseFloat(((passed / eligible) * 100).toFixed(2))
            : 0;

        entry.programId = programId;
        entry.branchId = branchId;
        entry.semesterNumber = semVal;
        entry.yearNumber = yrVal;
        entry.section = secNum;
        entry.totalStudents = total;
        entry.eligibleStudents = eligible;
        entry.passedStudents = passed;
        entry.passPercentage = passPercentage;
        entry.status = "Pending";
        entry.remarks = ""; // reset rejection remarks
        entry.approvedBy = null;
        entry.approvalDate = null;

        await entry.save();
        res.json({ success: true, data: entry });
    } catch (err) {
        console.error("Update Proctoring Entry Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Delete a proctoring entry
// @route   DELETE /api/faculty-proctoring/:id
// @access  Private (Faculty owner only)
exports.deleteEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const facultyId = req.user.userId;

        const entry = await FacultyProctoringEntry.findById(id);
        if (!entry) {
            return res.status(404).json({ success: false, message: "Proctoring entry not found." });
        }

        if (entry.facultyId.toString() !== facultyId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to delete this entry." });
        }

        if (entry.status === "Approved") {
            return res.status(400).json({ success: false, message: "Approved proctoring entries cannot be deleted." });
        }

        await entry.deleteOne();
        res.json({ success: true, message: "Proctoring entry deleted successfully." });
    } catch (err) {
        console.error("Delete Proctoring Entry Error:", err);
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
            .populate("programId", "name code programPattern")
            .populate("branchId", "name code")
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
        const entries = await FacultyProctoringEntry.find({
            facultyId: { $in: facultyIds }
        })
        .populate("facultyId", "name institutionId department coreDepartment")
        .populate("academicYear", "year")
        .populate("programId", "name code programPattern")
        .populate("branchId", "name code")
        .populate("approvedBy", "name")
        .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        console.error("Get HOD Proctoring Entries Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD action (Approve/Reject) on single proctoring entry
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
            .populate("programId", "name code programPattern")
            .populate("branchId", "name code")
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

// @desc    HOD action (Approve/Reject) on all pending proctoring entries for a faculty in an academic year (Bulk)
// @route   POST /api/faculty-proctoring/hod-action-bulk
// @access  Private (HOD)
exports.hodBulkAction = async (req, res) => {
    try {
        const { facultyId, academicYear, action, remarks } = req.body;

        if (!facultyId || !academicYear || !action || !["Approve", "Reject"].includes(action)) {
            return res.status(400).json({ success: false, message: "Missing required parameters or invalid action." });
        }

        const status = action === "Approve" ? "Approved" : "Rejected";

        const updateResult = await FacultyProctoringEntry.updateMany(
            { facultyId, academicYear, status: "Pending" },
            {
                $set: {
                    status,
                    approvedBy: req.user.userId,
                    approvalDate: new Date(),
                    remarks: remarks || ""
                }
            }
        );

        res.json({
            success: true,
            message: `Successfully processed ${updateResult.modifiedCount} entries as ${status}.`
        });
    } catch (err) {
        console.error("HOD Proctoring Bulk Action Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
