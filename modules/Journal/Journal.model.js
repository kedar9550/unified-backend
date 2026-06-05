const mongoose = require('mongoose');

const CoAuthorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null }
}, { _id: false });

const JournalSchema = new mongoose.Schema({
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
    college: { type: String },
    panNumber: { type: String },
    doi: { type: String, required: true, trim: true },
    
    publicationScope: { type: String, required: true },
    totalAuthors: { type: Number, required: true },
    userAuthorPosition: { type: Number, required: true },
    journalQuartile: { type: String, required: true },
    journalType: { type: String },
    paperTitle: { type: String, required: true },
    coAuthors: [CoAuthorSchema],
    journalName: { type: String, required: true },
    vol: { type: String },
    issue: { type: String },
    publishedMonth: { type: String, required: true },
    publishedYear: { type: String, required: true },
    hIndex: { type: String },
    jcrImpactFactor: { type: String },
    citations: { type: String },
    agecReferencingNumbers: { type: String },
    numberOfReferencesBelongingToAGEC: { type: Number },
    sdgs: { type: String },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'], required: true },
    completeJournalName: { type: String },
    applyIncentive: { type: String, enum: ['Yes', 'No'], required: true },
    
    // Files
    publishedPaper: { type: String, required: true },
    referencePages: { type: String, required: true },
    completeJournal: { type: String },
    
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

module.exports = mongoose.model('Journal', JournalSchema);
