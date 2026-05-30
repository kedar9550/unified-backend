const mongoose = require("mongoose");

const FacultyProctoringEntrySchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    totalStudents: {
        type: Number,
        required: true,
        min: [0, "Total students cannot be negative"]
    },
    studentsAppeared: {
        type: Number,
        required: true,
        min: [0, "Students appeared cannot be negative"]
    },
    studentsPassed: {
        type: Number,
        required: true,
        min: [0, "Students passed cannot be negative"]
    },
    passPercentage: {
        type: Number,
        required: true,
        min: [0, "Pass percentage cannot be negative"],
        max: [100, "Pass percentage cannot exceed 100"]
    },
    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending"
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        default: null
    },
    approvalDate: {
        type: Date,
        default: null
    },
    remarks: {
        type: String,
        default: ""
    }
}, { timestamps: true });

// Enforce unique manual proctoring entry per academic year per faculty
FacultyProctoringEntrySchema.index(
    { facultyId: 1, academicYear: 1 },
    { unique: true }
);

module.exports = mongoose.model("FacultyProctoringEntry", FacultyProctoringEntrySchema);
