const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
    faculty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    facultyId: {
        type: String, // institutionId for fast lookup
        required: true
    },
    subjectName: {
        type: String,
        required: true,
        trim: true
    },
    className: {
        type: String,
        required: true,
        trim: true  // e.g. "CSE-A"
    },
    semester: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Semester',
        required: true
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true
    },

    // Feedback scores (scale 1-5 or percentage — configurable)
    rating: {
        type: Number,
        required: true,
        min: 0,
        max: 5
    },
    totalResponses: {
        type: Number,
        default: 0
    },
    comments: {
        type: String,
        trim: true,
        default: ''
    },

    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadBatch: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', FeedbackSchema);
