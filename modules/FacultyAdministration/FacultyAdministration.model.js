const mongoose = require("mongoose");

const AdministrativeRoleSchema = new mongoose.Schema({
    roleId: {
        type: String,
        required: true
    },
    roleLabel: {
        type: String,
        required: true
    },
    isResponsible: {
        type: Boolean,
        default: false
    },
    level: {
        type: String,
        enum: ["Institute level", "Department level", "Central", "Department", ""],
        default: ""
    },
    assignedBy: {
        type: {
            type: String,
            enum: ["Pro Chancellor", "Deputy Pro Chancellor", "Vice Chancellor", "Registrar", "HOD", "Others", ""]
        },
        otherText: {
            type: String,
            default: ""
        }
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
