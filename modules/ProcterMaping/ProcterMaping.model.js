const mongoose = require("mongoose");

const procterMapingSchema = new mongoose.Schema({
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    semesterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Semester",
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
})

module.exports = mongoose.model("ProcterMaping", procterMapingSchema);