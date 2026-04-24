const mongoose = require('mongoose');

const AcademicYearSchema = new mongoose.Schema({
    year: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        // e.g. "2024-2025"
        match: [/^\d{4}-\d{4}$/, 'Format must be YYYY-YYYY']
    },
    isActive: {
        type: Boolean,
        default: false
    },
    activeSemesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SemesterType'
    }
}, { timestamps: true });

module.exports = mongoose.model('AcademicYear', AcademicYearSchema);
