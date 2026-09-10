const mongoose = require('mongoose');

const CoAuthorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: String, default: null }, // stores institutionId string e.g. "5741"
    authorPosition: { type: Number, default: null },
    studentId: { type: String, default: null },
    CoAuthorType: { type: String, default: 'faculty' },
}, { _id: false });


const ConferenceSchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true
    },

    // ── NEW: DOI & Scopus tracking fields ──────────────────────────────────────
    scopusSubtype: { type: String, default: "cp" }, // 'cp' = confirmed conference paper
    // ────────────────────────────────────────────────────────────────────────────

    title: { type: String, required: true },
    conferenceName: { type: String, required: true },
    scope: { type: String, enum: ['National', 'International'], required: true },
    month: { type: String },
    year: { type: String },
    
    // Conference details
    doi: { type: String, trim: true, default: null, unique: true, sparse: true },
    issnIsbn: { type: String },
    publisher: { type: String },
    indexing: { type: String },
    totalAuthors: { type: Number },
    userAuthorPosition: { type: Number },
    coAuthors: [CoAuthorSchema],

    isStudentsInvolved: { type: String, enum: ['Yes', 'No'], default: 'No' },

    applyIncentive: { type: String, enum: ['Yes', 'No'] },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'] },
    college: { type: String },
    panNumber: { type: String },

    // Files
    certificate: { type: String },
    proceedings: { type: String },

    status: {
        type: String,
        enum: ['Pending at R&D', 'Approved', 'Rejected by R&D'],
        default: 'Pending at R&D'
    },
    hodComment: { type: String },
    rndComment: { type: String },
    approvedAmount: { type: Number },

    appraisalClaimant: {
        type: String,
        default: null
    },
    incentiveClaimant: {
        type: String,
        default: null
    },
    appraisalEligible: {
        type: String,
        enum: ['Yes', 'No'],
        default: null
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Conference', ConferenceSchema);
