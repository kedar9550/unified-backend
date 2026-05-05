const mongoose = require("mongoose");

const procterMapingSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: true,
        unique: true // One document per student
    },
    studentName: {
        type: String,
        required: true
    },

    // ── Current Active Proctor ──────────────────────────────────────────
    currentProctorId: {
        type: String,
        required: true
    },
    currentProctorName: {
        type: String,
        required: true
    },

    // When this proctor started
    fromSemester: {
        type: Number,
        default: null
    },
    fromYearName: {
        type: String, // e.g. "I Year" for Pharma.D
        default: null
    },
    fromAcademicYear: {
        type: String, // e.g. "2023-2024"
        required: true
    },
    // ────────────────────────────────────────────────────────────────────

    // ── History of Previous Proctors ────────────────────────────────────
    history: [
        {
            proctorId: { type: String, required: true },
            proctorName: { type: String, required: true },

            fromSemester: { type: Number, default: null },
            fromYearName: { type: String, default: null },
            fromAcademicYear: { type: String, required: true },

            toSemester: { type: Number, default: null },
            toYearName: { type: String, default: null },
            toAcademicYear: { type: String, required: true },
            toDate: { type: Date, default: Date.now }
        }
    ]
    // ────────────────────────────────────────────────────────────────────

}, { timestamps: true });

module.exports = mongoose.model("ProcterMaping", procterMapingSchema);
