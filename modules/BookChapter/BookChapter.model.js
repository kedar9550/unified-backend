const mongoose = require('mongoose');

const CoAuthorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: String, default: null },  // stores institutionId string e.g. "5741"
    authorPosition: { type: String }
}, { _id: false });


const BookChapterSchema = new mongoose.Schema({
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
    
    textBookName: { type: String, required: true },
    chapterTitle: { type: String, required: true },
    doi: { type: String },
    isbnNumber: { type: String },
    yearOfPublication: { type: String, required: true },


    userAuthorPosition: { type: String },
    totalAuthors: { type: String },
    publicationScope: { type: String, enum: ['National', 'International'], default: 'National' },
    publisher: { type: String, required: true },
    coAuthors: [CoAuthorSchema],
    month: { type: String, required: true },
    year: { type: String, required: true },
    applyIncentive: { type: String, enum: ['Yes', 'No'], required: true },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'], required: true },
    
    // Files
    coverPage: { type: String },
    authorAffiliation: { type: String, required: true },
    index: { type: String },
    softCopy: { type: String },
    
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

module.exports = mongoose.model('BookChapter', BookChapterSchema);
