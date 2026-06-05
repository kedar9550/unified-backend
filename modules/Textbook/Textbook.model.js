const mongoose = require('mongoose');

const AuthorSchema = new mongoose.Schema({
    authorPosition: {
        type: Number,
        required: true
    },
    authorName: {
        type: String,
        required: true
    },
    affiliationType: {
        type: String,
        enum: ['Aditya University', 'Others'],
        required: true
    },
    employeeId: {
        type: String,
        default: null
    },
    employeeObjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },
    affiliationName: {
        type: String,
        required: true
    },
    isIncentiveApplicant: {
        type: Boolean,
        default: false
    },
    contributorOnly: {
        type: Boolean,
        default: true
    }
}, { _id: false });

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
        maxlength: 200 // Increased maxlength to accommodate real textbook titles
    },
    publisher: {
        type: String,
        required: true
    },
    isbn: {
        type: String,
        required: true,
        trim: true
    },
    publicationType: {
        type: String,
        required: true,
        default: 'National'
    },
    yearOfPublication: {
        type: String,
        required: true
    },
    totalAuthors: {
        type: Number,
        required: true,
        min: 1
    },
    userAuthorPosition: {
        type: Number,
        required: true,
        min: 1
    },

    edition: {
        type: String,
        required: true
    },
    cost: {
        type: String,
        default: ""
    },
    authors: [AuthorSchema], // Embedded authors array
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

    
    // Files
    coverPage: { type: String, required: true },
    authorAffiliation: { type: String, required: true },
    index: { type: String, required: true },
    
    // Workflow Status
    status: {
        type: String,
        enum: ['Draft', 'Pending at HOD', 'Pending at R&D', 'Approved', 'Rejected by HOD', 'Rejected by R&D'],
        default: 'Pending at HOD'
    },
    
    // Feedback
    hodComment: { type: String },
    rndComment: { type: String },
    approvedAmount: { type: Number },
    
    // Discrepancy
    discrepancyRaised: {
        type: Boolean,
        default: false
    },
    discrepancyComment: { type: String },
    discrepancyProof: { type: String }, // File path
    
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

module.exports = mongoose.model('Textbook', TextbookSchema);
