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
    },
    semesterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Semester",
    },

    phase: { type: Number, enum: [1, 2] },

    totalStudents: Number,
    givenStudents: Number,
    percentage: Number,
    overallPercentage: Number,

    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
}, { timestamps: true });

module.exports = mongoose.model("FacultyFeedResult", FacultyFeedResultSchema);
