const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
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
    description: {
        type: String,
        trim: true
    },
    status: {
        type: Boolean,
        default: true,
        index: true
    },
    type: {
        type: String,
        enum: ['Academic', 'Central'],
        default: 'Academic',
        required: true
    },

    schoolIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School'
    }],
    programId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Program'
    }
}, { timestamps: true });

// Enforce uniqueness of name/code within the same program
departmentSchema.index({ programId: 1, code: 1 }, { unique: true, sparse: true });
departmentSchema.index({ programId: 1, name: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Department', departmentSchema);
