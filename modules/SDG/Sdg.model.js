const mongoose = require("mongoose");

const sdgSchema = new mongoose.Schema({
    sdgNumber: { type: String, required: true },
    sdgTitle: { type: String, required: true },
    keywords: { type: [String], required: true },
    imageUrl: { type: String, default: "" },
    backgroundColor: { type: String, default: "" },
    color: { type: String, default: "" }
}, {
    timestamps: true
});

module.exports = mongoose.model("Sdg", sdgSchema);