const mongoose = require('mongoose');

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
    indexing: { type: String },
    presentationType: { type: String, enum: ['Oral', 'Poster', 'Keynote'] },
    firstAuthor: { type: String, enum: ['Yes', 'No'] },
    
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
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Conference', ConferenceSchema);
