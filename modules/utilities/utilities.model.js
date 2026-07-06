const mongoose = require('mongoose');

const utilitySchema = new mongoose.Schema({
    longUrl: {
        type: String,
        required: true,
        trim: true
    },
    shortCode: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    clicks: {
        type: Number,
        default: 0
    },
    expiresAt: {
        type: Date,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    type: {
        type: String,
        enum: ['short_url', 'qr'],
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Utility', utilitySchema);
