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
    semesterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Semester",
    },

    appeared: Number,
    passed: Number,
    passPercentage: Number,

    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
}, { timestamps: true });

module.exports = mongoose.model("FacultySubjectResult", FacultySubjectResultSchema);