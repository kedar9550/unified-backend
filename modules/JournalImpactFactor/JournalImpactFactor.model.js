const mongoose = require('mongoose');

const JournalImpactFactorSchema = new mongoose.Schema({
    rank: {
        type: Number,
        required: true
    },
    journalName: {
        type: String,
        required: true,
        trim: true
    },
    abbreviatedJournal: {
        type: String,
        trim: true,
        default: ''
    },
    publisher: {
        type: String,
        trim: true,
        default: ''
    },
    jif: {
        type: Number,
        required: true,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indices for optimizing queries and text search
JournalImpactFactorSchema.index({ journalName: 1 });
JournalImpactFactorSchema.index({ rank: 1 });
JournalImpactFactorSchema.index({ abbreviatedJournal: 1 });

module.exports = mongoose.model('JournalImpactFactor', JournalImpactFactorSchema);
