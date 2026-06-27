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
    scopusId: {
        type: String,
        trim: true,
        default: ""
    },
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
