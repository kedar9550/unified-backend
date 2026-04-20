const mongoose = require('mongoose');

const SemesterSchema = new mongoose.Schema({
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true
    },
    type: {
        type: String,
        enum: ['ODD', 'EVEN', 'SUMMER'],
        required: true,
        uppercase: true
    },
    isActive: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Prevent duplicate semester type within same academic year
SemesterSchema.index({ academicYear: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Semester', SemesterSchema);
