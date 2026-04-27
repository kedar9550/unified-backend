const mongoose = require("mongoose");

const procterMapingSchema = new mongoose.Schema({
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    semester: {
        type: Number,
        required: true
    },
    semesterTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SemesterType",
        required: true
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

procterMapingSchema.index(
    { studentId: 1, semester: 1 },
    { unique: true }
);

module.exports = mongoose.model("ProcterMaping", procterMapingSchema);