const mongoose = require('mongoose');

const UserAppRoleSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'userModel'
    },
    userModel: {
        type: String,
        required: true,
        enum: ['Employee', 'Student'],
        default: 'Employee'
    },
    app: {
        type: String,
        required: true,
        default: 'UNIFIED_SYSTEM'
    },
    role: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role',
        required: true,
    },
    departments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
    }]
}, { timestamps: true });

// Prevent duplicate roles for the same user per app
UserAppRoleSchema.index({ userId: 1, app: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('UserAppRole', UserAppRoleSchema);
