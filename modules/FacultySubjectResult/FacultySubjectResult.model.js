// models/FacultyResult.js
const mongoose = require("mongoose");

const FacultySubjectResultSchema = new mongoose.Schema({
    facultyId: { type: String, trim: true },  // institutional ID e.g. FAC2024001
    facultyName: String,

    subjectName: String,
    subjectCode: String,
    branch: String,

    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
    },
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
    },

    appeared: Number,
    passed: Number,
    passPercentage: Number,

    semester: Number,
    semType: {
        type: String,
        enum: ["ODD", "EVEN"],
    },

    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
    },
}, { timestamps: true });

module.exports = mongoose.model("FacultySubjectResult", FacultySubjectResultSchema);