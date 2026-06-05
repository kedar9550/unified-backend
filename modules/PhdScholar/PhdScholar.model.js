const mongoose = require('mongoose');

const PhdScholarSchema = new mongoose.Schema({
    rollNumber: {
        type: String,
        required: true,
        unique: true,
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
    currentStatus: {
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
    guideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('PhdScholar', PhdScholarSchema);
