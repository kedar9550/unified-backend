const mongoose = require("mongoose");

const ProctorSummarySchema = new mongoose.Schema({
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
        required: true
    },
    proctorId: {
        type: String, // String to match ProcterMaping's facultyId/proctorId string format
        required: true
    },
    proctorName: {
        type: String,
        default: ""
    },
    totalMappedStudents: {
        type: Number,
        default: 0
    },
    studentsAppeared: {
        type: Number,
        default: 0
    },
    studentsPassed: {
        type: Number,
        default: 0
    },
    passPercentage: {
        type: Number,
        default: 0
    },
    lastCalculatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Compound index to ensure uniqueness per proctor per semester type per year
ProctorSummarySchema.index({ academicYearId: 1, semesterTypeId: 1, proctorId: 1 }, { unique: true });

module.exports = mongoose.model("ProctorSummary", ProctorSummarySchema);
