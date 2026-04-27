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
    hasStudents: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
