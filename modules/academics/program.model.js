const mongoose = require('mongoose');

const programSchema = new mongoose.Schema({
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
    type: {
        type: String,
        enum: ['UG', 'PG', 'PHD', 'DIPLOMA', 'CERTIFICATE'],
        required: true
    },
    description: {
        type: String,
        trim: true
    },
    durationYears: {
        type: Number,
        required: true,
        default: 4
    },
    programPattern: {
        type: String,
        enum: ['SEMESTER', 'YEAR'],
        default: 'SEMESTER'
    },
    status: {
        type: Boolean,
        default: true,
        index: true
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School'
    }
}, { timestamps: true });

module.exports = mongoose.model('Program', programSchema);
