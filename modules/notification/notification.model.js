const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee', // or 'Student', handled generically
        required: true,
        index: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },
    module: {
        type: String,
        required: true, // e.g., 'Research', 'Appraisal', 'RoleManagement'
    },
    type: {
        type: String,
        enum: ['INFO', 'ACTION_REQUIRED', 'SUCCESS', 'REJECTED', 'WARNING'],
        default: 'INFO'
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    link: {
        type: String,
        default: null // e.g., '/research/journal/123'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '30d' // TTL Index: Auto-deletes after 30 days
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {} // Flexible for any additional JSON payload
    }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
