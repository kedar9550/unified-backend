const mongoose = require("mongoose");

const AuthorCitationsSchema = new mongoose.Schema({
    empid: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee"
    },
    // NOTE: scopusId intentionally removed from this schema (Aug 2026).
    // Scopus Author ID now lives only on the Employee profile (Employee.scopusId)
    // and is looked up via $lookup wherever needed, to avoid duplicate data entry.
    citations: {
        type: Map,
        of: Number,
        default: {}
    },
    hIndex: {
        type: Map,
        of: Number,
        default: {}
    }
}, { timestamps: true });

module.exports = mongoose.model("AuthorCitations", AuthorCitationsSchema, "authorcitations");
