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

    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },

    semester: {
        type: String,
        required: true,
        trim: true
    },

    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
    },

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
    grade: {
        type: String,
        trim: true
    },

    sgpa: {
        type: Number
    },

    cgpa: {
        type: Number
    },
    result: {
        type: String,
        enum: ["PASS", "FAIL"],
        default: "PASS"
    },

    //  Audit
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },

}, { timestamps: true });

module.exports = mongoose.model("StudentResult", StudentResultSchema);