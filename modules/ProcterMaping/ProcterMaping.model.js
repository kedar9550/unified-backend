const mongoose = require("mongoose");

const procterMapingSchema = new mongoose.Schema({
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },

    // semester: Number (1,2,3...) for B.Tech/M.Tech
    //           null for Pharma.D (year-based) and Summer
    semester: {
        type: Number,
        default: null
    },

    // semesterTypeId: ref to SemesterType
    // ODD / EVEN / SUMMER / YEAR
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
        required: true
    },

    // yearName: only for Pharma.D — "I Year", "II Year" etc.
    // null for all other programs
    yearName: {
        type: String,
        default: null
    },

    proctorId: {
        type: String,
        required: true
    },
    proctorName: {
        type: String,
        required: true
    },
    studentId: {
        type: String,
        required: true
    },
    studentName: {
        type: String,
        required: true
    }
}, { timestamps: true });

// ── FIXED Unique Index ───────────────────────────────────────────────────────
//
// OLD (WRONG):
//   { studentId: 1, semester: 1 }
//   Problem: same student can't be assigned in semester 1 across different academic years!
//            Also, Pharma.D students (semester=null) would all collide.
//
// NEW (CORRECT):
//   { studentId: 1, academicYearId: 1, semesterTypeId: 1 }
//   Meaning: one proctor per student per semester-type per academic year.
//
//   Examples:
//   - 22B81A0501 + 2024-2025 + ODD  → proctor A  ✓
//   - 22B81A0501 + 2025-2026 + ODD  → proctor B  ✓  (new year, allowed)
//   - 22B81A0501 + 2025-2026 + EVEN → proctor B  ✓  (different sem type)
//   - 25B14PD001 + 2025-2026 + YEAR → proctor C  ✓  (Pharma.D)
//
procterMapingSchema.index(
    { studentId: 1, academicYearId: 1, semesterTypeId: 1 },
    { unique: true }
);
// ─────────────────────────────────────────────────────────────────────────────

module.exports = mongoose.model("ProcterMaping", procterMapingSchema);
