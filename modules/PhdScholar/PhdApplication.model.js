const mongoose = require('mongoose');

const PhdApplicationSchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
        index: true
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
        index: true
    },
    rollNumber: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        index: true
    },
    studentName: {
        type: String,
        required: true,
        trim: true
    },
    course: {
        type: String,
        required: true,
        trim: true
    },
    branch: {
        type: String,
        trim: true
    },
    scholarStatus: {
        type: String,
        enum: ['Pursuing', 'Awarded'],
        required: true
    },
    scholarType: {
        type: String,
        enum: ['Full-Time', 'Part-Time'],
        required: true
    },
    university: {
        type: String,
        required: true,
        trim: true
    },
    admissionOrAwardDate: {
        type: Date,
        required: true
    },
    document: {
        type: String, // Path of uploaded proof document
        required: true
    },
    status: {
        type: String,
        enum: ['Pending at HOD', 'Pending at R&D', 'Approved', 'Rejected by HOD', 'Rejected by R&D'],
        default: 'Pending at HOD'
    },
    hodComment: {
        type: String
    },
    rndComment: {
        type: String
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('PhdApplication', PhdApplicationSchema);
