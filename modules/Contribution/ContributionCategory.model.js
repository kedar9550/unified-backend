const mongoose = require('mongoose');

const ContributionCategorySchema = new mongoose.Schema({
    code: {
        type: Number,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ContributionCategory', ContributionCategorySchema);