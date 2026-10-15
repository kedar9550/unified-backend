const mongoose = require('mongoose');

const JournalImpactFactorSchema = new mongoose.Schema({
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
    issn: {
        type: String,
        trim: true,
        default: ''
    },
    eissn: {
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
JournalImpactFactorSchema.index({ abbreviatedJournal: 1 });
JournalImpactFactorSchema.index({ issn: 1 });
JournalImpactFactorSchema.index({ eissn: 1 });

module.exports = mongoose.model('JournalImpactFactor', JournalImpactFactorSchema);
