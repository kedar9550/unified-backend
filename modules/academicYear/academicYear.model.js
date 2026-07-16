const mongoose = require('mongoose');

/*
 * NEW SCHEMA — one document per academic year string (e.g. "2025-2026").
 * Programs are stored as a sub-array so every faculty / module that touches
 * "2025-2026" always gets the SAME _id, regardless of which program they belong to.
 *
 * Migration: run scripts/migrate-academicYear.js once to collapse the old
 * 24 program-scoped records into 3 year-level documents and fix all refs.
 */

// const ProgramEntrySchema = new mongoose.Schema({
//     programId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Program',
//         required: true
//     },
//     isActive: {
//         type: Boolean,
//         default: false
//     },
//     // Which semester / year period is currently active for this program
//     activeSemesterTypeId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'SemesterType',
//         default: null
//     }
// }, { _id: false });         

const AcademicYearSchema = new mongoose.Schema({
    year: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        match: [/^\d{4}-\d{4}$/, 'Format must be YYYY-YYYY']
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    active: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('AcademicYear', AcademicYearSchema);
