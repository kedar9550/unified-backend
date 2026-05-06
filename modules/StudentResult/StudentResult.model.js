const mongoose = require("mongoose");

const StudentResultSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: true,
        trim: true
    },

    studentName: {
        type: String,
        trim: true,
        default: ""
    },

    subjectCode: {
        type: String,
        required: true,
        trim: true
    },

    subjectName: {
        type: String,
        trim: true,
        default: ""
    },
    subjectType: {
        type: String,
        enum: ["THEORY", "PRACTICAL", "INTEGRATED"],
        default: "THEORY"
    },

    //  Academic Structure
    departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: true
    },

    programId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Program",
        required: true
    },

    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        required: true
    },

    // ── Semester / Year Fields ──────────────────────────────────────────────
    //
    //   SEM programs (B.Tech, M.Tech, MBA etc):
    //     semester = "1", "2", "3" ... (string)
    //     yearName = null
    //
    //   YEAR programs (Pharma.D):
    //     semester = null
    //     yearName = "I Year", "II Year", "III Year" etc.
    //
    semester: {
        type: String,
        default: null,
        trim: true
    },
    yearName: {
        type: String,
        default: null,
        trim: true
        // e.g. "I Year", "II Year" for Pharma.D
    },
    // ────────────────────────────────────────────────────────────────────────

    //  Exam Info
    examYear: {
        type: String, // ex: "2025"
        required: true
    },

    resultType: {
        type: String,
        enum: ["REGULAR", "SUPPLY"],
        default: "REGULAR"
    },

    //  Marks / Grades
    //  For SEM programs: grade, sgpa, cgpa used
    //  For YEAR programs (Pharma.D): intMarks, extMarks, totalMarks, maxMarks used
    grade: {
        type: String,
        trim: true,
        default: ""
    },

    sgpa: {
        type: Number,
        default: 0
    },

    cgpa: {
        type: Number,
        default: 0
    },

    // Marks fields for year-based programs (Pharma.D)
    intMarks: {
        type: Number,
        default: null
    },
    extMarks: {
        type: Number,
        default: null
    },
    totalMarks: {
        type: Number,
        default: null
    },
    maxMarks: {
        type: Number,
        default: null
    },

    result: {
        type: String,
        enum: ["PASS", "FAIL"],
        default: "PASS"
    },

    //  Audit
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
    },

}, { timestamps: true });

module.exports = mongoose.model("StudentResult", StudentResultSchema);
