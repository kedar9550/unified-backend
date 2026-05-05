const mongoose = require('mongoose');

const AcademicYearSchema = new mongoose.Schema({
    year: {
        type: String,
        required: true,
        trim: true,
        // e.g. "2024-2025"
        match: [/^\d{4}-\d{4}$/, 'Format must be YYYY-YYYY']
    },

    // e.g. "B.Tech", "M.Tech", "Pharma.D", "MBA"
    // null means it applies to ALL programs (global fallback container)
    programId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Program',
        default: null
    },

    isActive: {
        type: Boolean,
        default: false
    },

    // Active semester for this program's academic year
    activeSemesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SemesterType'
    }
}, { timestamps: true });

// Unique per program+year combination
// (null programId = global fallback for programs not explicitly set)
AcademicYearSchema.index({ year: 1, programId: 1 }, { unique: true });

module.exports = mongoose.model('AcademicYear', AcademicYearSchema);
