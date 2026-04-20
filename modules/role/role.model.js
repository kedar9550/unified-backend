const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        uppercase: true, // E.g., SUPER ADMIN, EXAM CELL, FACULTY, USER
    },
    defaultRole: {
        type: Boolean,
        required: true,
        default: false,
    },
    app: {
        type: String,
        required: true,
        default: 'UNIFIED_SYSTEM',
    },
    description: {
        type: String,
    }
}, { timestamps: true });

module.exports = mongoose.model('Role', RoleSchema);
