const mongoose = require('mongoose');

const CoAuthorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true }
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
    
    incentiveApplied: { type: String, required: true },
    firstAuthor: { type: String, enum: ['Yes', 'No'], required: true },
    authorPosition: { type: String },
    categoryOfJournal: { type: String, required: true },
    papersCited: { type: String },
    paperTitle: { type: String, required: true },
    coAuthors: [CoAuthorSchema],
    journalName: { type: String, required: true },
    vol: { type: String },
    issue: { type: String },
    pageNos: { type: String },
    month: { type: String, required: true },
    year: { type: String, required: true },
    hIndex: { type: String },
    impactFactor: { type: String },
    referencingNos: { type: String },
    sdgs: { type: String },
    applyIncentive: { type: String, enum: ['Yes', 'No'], required: true },
    
    // Files
    publishedPaper: { type: String, required: true },
    referencePages: { type: String, required: true },
    
    status: {
        type: String,
        enum: ['Pending at HOD', 'Pending at R&D', 'Approved', 'Rejected by HOD', 'Rejected by R&D'],
        default: 'Pending at HOD'
    },
    hodComment: { type: String },
    rndComment: { type: String },
    approvedAmount: { type: Number },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Journal', JournalSchema);
