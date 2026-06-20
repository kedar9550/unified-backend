const mongoose = require('mongoose');

const JournalMasterSchema = new mongoose.Schema({
    journalTitle: {
        type: String,
        required: [true, 'Journal title is required'],
        trim: true,
        uppercase: true
    },
    impactFactor: {
        type: Number,
        default: null
    },
    type: {
        type: String,
        required: [true, 'Type is required'],
        trim: true
    }
}, {
    timestamps: true,
    collection: 'journalmasters'
});

// Indexes for faster lookups
JournalMasterSchema.index({ journalTitle: 1 });

module.exports = mongoose.model('JournalMaster', JournalMasterSchema);
