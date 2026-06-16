const mongoose = require("mongoose");

const FacultyProctoringEntrySchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true
    },
    empId: {
        type: String,
        required: true
    },
    facultyName: {
        type: String,
        required: true
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    programme: {
        type: String,
        required: true
    },
    programId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Program",
        required: true
    },
    branch: {
        type: String,
        required: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch"
    },
    semesterNumber: {
        type: Number,
        default: null
    },
    yearNumber: {
        type: Number,
        default: null
    },
    section: {
        type: String,
        required: true
    },
    totalStudents: {
        type: Number,
        required: true,
        min: [0, "Total allotted students cannot be negative"]
    },
    eligibleStudents: {
        type: Number,
        required: true,
        min: [0, "Eligible students cannot be negative"]
    },
    passedStudents: {
        type: Number,
        required: true,
        min: [0, "Passed students cannot be negative"]
    },
    passPercentage: {
        type: Number,
        required: true,
        min: [0, "Pass percentage cannot be negative"],
        max: [100, "Pass percentage cannot exceed 100"]
    },
    removedFromAppraisal: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Index for query performance on faculty and academic year
FacultyProctoringEntrySchema.index(
    { facultyId: 1, academicYear: 1 }
);

module.exports = mongoose.model("FacultyProctoringEntry", FacultyProctoringEntrySchema);

