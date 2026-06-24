const mongoose = require('mongoose');

const ReferenceJournalSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    impactFactor: {
        type: String,
        required: true,
        trim: true,
        default: 'NA'
    },
    type: {
        type: String,
        required: true,
        trim: true
    },
    publisher: {
        type: String,
        trim: true,
        default: ''
    },
    link: {
        type: String,
        trim: true,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to prevent exact duplicates (same journal under the same list category)
ReferenceJournalSchema.index({ title: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('ReferenceJournal', ReferenceJournalSchema);
