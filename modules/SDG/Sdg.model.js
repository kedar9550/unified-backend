const mongoose = require("mongoose");

const sdgSchema = new mongoose.Schema({
    sdgNumber: { type: String, required: true },
    sdgTitle: { type: String, required: true },
    keywords: { type: [String], required: true },

});

module.exports = mongoose.model("Sdg", sdgSchema);