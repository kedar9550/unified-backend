const mongoose = require("mongoose");

const FacultyFeedResultSchema = new mongoose.Schema({
    facultyId: { type: String, trim: true },  // institutional ID e.g. FAC2024001
    facultyName: String,

    subjectName: String,
    subjectCode: String,
    branch: String,
    section: String,

    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true,
    },
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
    semesterNumber: { type: String }, // For SEM programs
    yearNumber: { type: String },     // For YEAR programs
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
    },

    phase: { type: Number, enum: [1, 2] },

    totalStudents: Number,
    givenStudents: Number,
    percentage: Number,
    overallPercentage: Number,

    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
    },
}, { timestamps: true });

module.exports = mongoose.model("FacultyFeedResult", FacultyFeedResultSchema);
