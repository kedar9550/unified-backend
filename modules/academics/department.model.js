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
    programIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Program'
    }]
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
