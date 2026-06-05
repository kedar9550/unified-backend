const mongoose = require("mongoose");

const AppraisalResearchClaimSchema = new mongoose.Schema({
    researchId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    researchType: {
        type: String,
        enum: ["Journal", "Patent", "BookChapter", "Textbook", "Conference", "FundedProject"],
        required: true
    },
    doiOrIsbn: {
        type: String,
        required: true
    },
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    claimedByFacultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true
    },
    undertakingDoc: { type: String } // Path to undertaking PDF if a non-first Aditya author claims
}, { timestamps: true });

// Ensure a single claim per research document
AppraisalResearchClaimSchema.index({ researchId: 1 }, { unique: true });

module.exports = mongoose.model("AppraisalResearchClaim", AppraisalResearchClaimSchema);
