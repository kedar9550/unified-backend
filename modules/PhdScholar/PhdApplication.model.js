const mongoose = require('mongoose');

const PursuingDetailsSchema = new mongoose.Schema({
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear'
    },
    admissionDate: {
        type: Date
    },
    document: {
        type: String // Admission letter proof
    },
    status: {
        type: String,
        enum: ['Pending', 'Pending at R&D', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    hodComment: {
        type: String
    },
    rndComment: {
        type: String
    },
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const AwardedDetailsSchema = new mongoose.Schema({
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear'
    },
    awardDate: {
        type: Date
    },
    document: {
        type: String // Degree award proceedings
    },
    status: {
        type: String,
        enum: ['Not Submitted', 'Pending', 'Pending at R&D', 'Approved', 'Rejected'],
        default: 'Not Submitted'
    },
    hodComment: {
        type: String
    },
    rndComment: {
        type: String
    },
    submittedAt: {
        type: Date
    }
}, { _id: false });

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
    titleOfPhdWork: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        sparse: true,
        index: true
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
    type: {
        type: String,
        enum: ['guide', 'co-guide'],
        default: 'guide'
    },
    status: {
        type: String,
        enum: ['Pending', 'Rejected', 'Pending at R&D', 'Approved', 'Rejected by R&D'],
        default: 'Pending'
    },
    hodComment: {
        type: String
    },
    rndComment: {
        type: String
    },
    entryType: {
        type: String,
        enum: ['Self', 'Admin'],
        default: 'Self'
    },
    // Structured milestone objects
    pursuingDetails: {
        type: PursuingDetailsSchema,
        default: () => ({})
    },
    awardedDetails: {
        type: AwardedDetailsSchema,
        default: () => ({ status: 'Not Submitted' })
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('PhdApplication', PhdApplicationSchema);
