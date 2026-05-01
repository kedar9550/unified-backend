const mongoose = require('mongoose');

const TextbookSchema = new mongoose.Schema({
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
    college: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true,
        maxlength: 60
    },
    publisher: {
        type: String,
        required: true
    },
    isbn: {
        type: String,
        required: true
    },
    yearOfPublication: {
        type: String,
        required: true
    },
    firstAuthor: {
        type: String,
        enum: ['Yes', 'No'],
        required: true
    },
    authorPosition: {
        type: Number,
        default: null
    },
    chaptersContributed: {
        type: Number,
        required: true
    },
    edition: {
        type: String,
        required: true
    },
    cost: {
        type: String,
        required: true
    },
    coAuthors: [{
        name: String,
        affiliation: String
    }],
    month: {
        type: String,
        required: true
    },
    year: {
        type: String,
        required: true
    },
    applyIncentive: {
        type: String,
        enum: ['Yes', 'No'],
        required: true
    },
    expectedAmount: {
        type: String,
        default: "10,000"
    },
    // Files
    coverPage: { type: String },
    authorAffiliation: { type: String },
    index: { type: String },
    
    // Workflow Status
    status: {
        type: String,
        enum: ['Pending at HOD', 'Pending at R&D', 'Approved', 'Rejected by HOD', 'Rejected by R&D'],
        default: 'Pending at HOD'
    },
    
    // Feedback
    hodComment: { type: String },
    rndComment: { type: String },
    
    // Discrepancy
    discrepancyRaised: {
        type: Boolean,
        default: false
    },
    discrepancyComment: { type: String },
    discrepancyProof: { type: String }, // File path
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Textbook', TextbookSchema);
