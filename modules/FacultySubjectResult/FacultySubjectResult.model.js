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


    // New fields for Unified System
    programId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Program",
        required: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        required: true,
    },
    semesterNumber: { type: String }, // For SEM programs (supports formats like "25-S")
    yearNumber: { type: String },     // For YEAR programs (Pharma.D)

    appeared: Number,
    passed: Number,
    passPercentage: Number,
    // Additional fields
    noOfCos: { type: Number, default: 0 }, // Number of COs
    noOfCosAttained: { type: Number, default: 0 }, // CO attainment target reached
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true,
    },
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
        // Nullable for YEAR programs
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
    },
}, { timestamps: true });

module.exports = mongoose.model("FacultySubjectResult", FacultySubjectResultSchema);