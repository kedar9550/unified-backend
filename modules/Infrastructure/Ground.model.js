const mongoose = require('mongoose');

const groundSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Ground name is required'],
        trim: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, { timestamps: true });

module.exports = mongoose.model('Ground', groundSchema);
