// models/FacultyResult.js
const mongoose = require("mongoose");

const FacultySubjectResultSchema = new mongoose.Schema({
    facultyId: { type: String, trim: true },  // institutional ID e.g. FAC2024001
    facultyName: String,

    // FacultySubjectResult schema with course fields and additional metrics
    courseName: String,
    courseCode: String,
    courseType: { type: String, enum: ["THEORY", "PRACTICAL", "INTEGRATED"] },
    branch: String,
    section: String,
    semester: Number,
    appeared: Number,
    passed: Number,
    passPercentage: Number,
    // Additional fields
    noOfCos: { type: Number, default: 0 }, // Number of COs
    noOfCosAttained: { type: Number, default: 0 }, // CO attainment target reached
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
    },
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
    },
}, { timestamps: true });

module.exports = mongoose.model("FacultySubjectResult", FacultySubjectResultSchema);