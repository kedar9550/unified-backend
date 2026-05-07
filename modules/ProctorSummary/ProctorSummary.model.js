const mongoose = require("mongoose");

/**
 * ProctorSummary — per proctor, per academic year, per semesterType summary.
 *
 * UNIQUE KEY:  proctorId + academicYearId + semesterTypeId + periodLabel
 *
 * SemesterType values (from SemesterType collection):
 *   ODD    → covers Sem 1, 3, 5, 7  → periodLabel = "ODD"
 *   EVEN   → covers Sem 2, 4, 6, 8  → periodLabel = "EVEN"
 *   YEAR   → Pharma.D               → periodLabel = "I Year" / "II Year" etc.
 *   SUMMER → Never stored here (skipped on upload)
 *
 * Example records:
 *   { proctorId:"FAC001", academicYearId:..., semesterTypeId:ODD_ID,  periodLabel:"ODD",    appeared:20, passed:17 }
 *   { proctorId:"FAC001", academicYearId:..., semesterTypeId:EVEN_ID, periodLabel:"EVEN",   appeared:20, passed:18 }
 *   { proctorId:"FAC002", academicYearId:..., semesterTypeId:YEAR_ID, periodLabel:"I Year", appeared:10, passed:8  }
 *   { proctorId:"FAC002", academicYearId:..., semesterTypeId:YEAR_ID, periodLabel:"II Year",appeared:10, passed:9  }
 */
const ProctorSummarySchema = new mongoose.Schema({
    proctorId: {
        type: String,           // institutionId — matches ProcterMaping.currentProctorId
        required: true
    },
    proctorName: {
        type: String,
        default: ""
    },
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
        required: true
    },
    // For SEM programs : "ODD" or "EVEN"
    // For YEAR programs: "I Year", "II Year", "III Year" etc.
    periodLabel: {
        type: String,
        required: true,
        trim: true
    },
    totalMappedStudents: {
        type: Number,
        default: 0
    },
    studentsAppeared: {
        type: Number,
        default: 0
    },
    studentsPassed: {
        type: Number,
        default: 0
    },
    studentsFailed: {
        type: Number,
        default: 0
    },
    passPercentage: {
        type: Number,
        default: 0
    },
    lastCalculatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

ProctorSummarySchema.index(
    { proctorId: 1, academicYearId: 1, semesterTypeId: 1, periodLabel: 1 },
    { unique: true }
);

module.exports = mongoose.model("ProctorSummary", ProctorSummarySchema);
