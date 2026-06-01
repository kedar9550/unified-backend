const mongoose = require("mongoose");

const AdministrativeRoleSchema = new mongoose.Schema({
    roleName: {
        type: String,
        required: true
    },
    isResponsible: {
        type: Boolean,
        default: false
    },
    level: {
        type: String,
        enum: ["Institute level", "Department level", ""],
        default: ""
    },
    details: {
        type: String,
        default: ""
    },
    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending"
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        default: null
    },
    approvalDate: {
        type: Date,
        default: null
    },
    remarks: {
        type: String,
        default: ""
    }
}, { _id: false });

const FacultyAdministrationSchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    roles: [AdministrativeRoleSchema],
    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending"
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        default: null
    },
    approvalDate: {
        type: Date,
        default: null
    },
    remarks: {
        type: String,
        default: ""
    }
}, { timestamps: true });

// Enforce unique manual entry per academic year per faculty
FacultyAdministrationSchema.index(
    { facultyId: 1, academicYear: 1 },
    { unique: true }
);

module.exports = mongoose.model("FacultyAdministration", FacultyAdministrationSchema);
