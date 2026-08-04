const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Floor name is required'],
        trim: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, { timestamps: true });

module.exports = mongoose.model('Floor', floorSchema);
