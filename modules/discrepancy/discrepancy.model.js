const mongoose = require("mongoose");

const DiscrepancySchema = new mongoose.Schema({
    // Who raised it
    raisedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true,
    },
    facultyInstitutionId: { type: String, trim: true },
    facultyName:          { type: String, trim: true },

    // What it's about
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true,
    },
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
        required: true,
    },
    section: {
        type: String,
        enum: ["TEACHING", "PROCTORING", "FEEDBACK", "OTHER"],
        required: true,
    },
    note: { type: String, required: true, trim: true },

    // Routing — set explicitly by controller
    assignedRole: { type: String, trim: true },

    // Status lifecycle
    status: {
        type: String,
        enum: ["PENDING", "RESOLVED", "REJECTED"],
        default: "PENDING",
    },

    // Resolution
    resolvedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    resolutionNote: { type: String, trim: true },
    rejectionNote:  { type: String, trim: true },
    proofDocument:  { type: String },

}, { timestamps: true });

module.exports = mongoose.model("Discrepancy", DiscrepancySchema);
