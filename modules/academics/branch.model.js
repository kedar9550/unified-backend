const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
    programId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Program',
        required: true
    },
    departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: true
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
        trim: true,
        unique: true
    },
    status: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Enforce unique combination of programId and code is no longer needed since code is globally unique 
// (or enforce combination if code repeats across programs, but usually it doesn't).
// We set unique: true on code above.

module.exports = mongoose.model('Branch', branchSchema);