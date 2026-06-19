const mongoose = require('mongoose');

const CoAuthorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: String, default: null }  // stores institutionId string e.g. "5741"
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
    doi: { type: String, default: null },
    scopusSubtype: { type: String, default: "cp" }, // 'cp' = confirmed conference paper
    // ────────────────────────────────────────────────────────────────────────────

    title: { type: String, required: true },
    conferenceName: { type: String, required: true },
    level: { type: String, enum: ['National', 'International'], required: true },
    venue: { type: String },
    organizer: { type: String },
    dateFrom: { type: Date },
    dateTo: { type: Date },
    month: { type: String },
    year: { type: String },
    issnIsbn: { type: String },
    publisher: { type: String },
    indexing: { type: String },
    presentationType: { type: String, enum: ['Oral', 'Poster', 'Keynote'] },
    firstAuthor: { type: String, enum: ['Yes', 'No'] },
    totalAuthors: { type: Number },
    userAuthorPosition: { type: Number },
    coAuthors: [CoAuthorSchema],

    applyIncentive: { type: String, enum: ['Yes', 'No'] },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'] },
    college: { type: String },
    panNumber: { type: String },

    // Files
    certificate: { type: String },
    proceedings: { type: String },

    status: {
        type: String,
        enum: ['Pending at HOD', 'Pending at R&D', 'Approved', 'Rejected by HOD', 'Rejected by R&D'],
        default: 'Pending at HOD'
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

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Conference', ConferenceSchema);
