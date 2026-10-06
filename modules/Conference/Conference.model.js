const mongoose = require('mongoose');

const CoAuthorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: String, default: null }, // stores institutionId string e.g. "5741"
    authorPosition: { type: Number, default: null },
    studentId: { type: String, default: null },
    studentQualification: { type: String, enum: ['UG', 'PG', 'Ph.D'], default: null },
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

    title: { type: String, required: true, trim: true, unique: true, sparse: true },
    conferenceName: { type: String, required: true },
    location: { type: String, enum: ['India', 'Abroad'], required: true },
    presentationMode: { type: String, enum: ['Online', 'Offline'] },
    conferenceType: { type: String, enum: ['IEEE', 'IITs/IISc/NITs/IIMs', 'IIT', 'IISc', 'NIT', 'IIM', 'Other'], required: true },
    month: { type: String },
    year: { type: String },
    
    // Conference details
    doi: { type: String, trim: true, default: null, unique: true, sparse: true },
    issnIsbn: { type: String },
    publisher: { type: String },
    scopusIndexed: { type: String, enum: ['Yes', 'No'] },
    totalAuthors: { type: Number },
    userAuthorPosition: { type: Number },
    coAuthors: [CoAuthorSchema],

    isStudentsInvolved: { type: String, enum: ['Yes', 'No'], default: 'No' },

    applyIncentive: { type: String, enum: ['Yes', 'No'] },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'] },
    college: { type: String },
    panNumber: { type: String },

    // Files
    firstPage: { type: String },
    certificate: { type: String },
    completeDocument: { type: String },
    flightTicket: { type: String },

    status: {
        type: String,
        enum: ['Pending', 'Rejected', 'Pending at R&D', 'Approved', 'Rejected by R&D'],
        default: 'Pending'
    },
    hodComment: { type: String },
    rndComment: { type: String },
    approvedAmount: { type: Number },
    estimatedIncentiveAmount: { type: Number, default: 0 },

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
    entryType: {
        type: String,
        enum: ['Self', 'Admin'],
        default: 'Self'
    },

    sdgs: { type: String, default: null },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Conference', ConferenceSchema);
