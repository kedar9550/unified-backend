const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
    programId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Program',
        required: true,
        index: true
    },
    departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    status: {
        type: Boolean,
        default: true,
        index: true
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        index: true
    }
}, { timestamps: true });

// Enforce unique combination of programId, departmentId, schoolId, and code
branchSchema.index({ programId: 1, departmentId: 1, schoolId: 1, code: 1 }, { unique: true });

// Enforce unique combination of programId, departmentId, schoolId, and name
branchSchema.index({ programId: 1, departmentId: 1, schoolId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Branch', branchSchema);