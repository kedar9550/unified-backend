const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    code: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        unique: true
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
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School'
    }
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
