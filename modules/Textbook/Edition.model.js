const mongoose = require('mongoose');

const EditionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware to normalize capitalization before saving
EditionSchema.pre('save', function(next) {
    if (this.name) {
        // Simple title case normalization, or just standard trim
        this.name = this.name.replace(/\s+/g, ' ').trim();
    }
    next();
});

module.exports = mongoose.model('Edition', EditionSchema);
