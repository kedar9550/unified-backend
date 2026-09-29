const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({

  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ticket",
    required: true,
    unique: true // one feedback per ticket
  },

  submittedByType: {
    type: String,
    enum: ["EMPLOYEE", "STUDENT"],
    default: "EMPLOYEE"
  },

  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    default: null
  },

  submittedByStudent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceDeskStudent",
    default: null
  },

  studentRollNo: {
    type: String,
    trim: true,
    default: null
  },

  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },

  satisfaction: {
    type: String,
    enum: ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"],
    required: true
  },

  comments: {
    type: String,
    maxLength: 500,
    default: ""
  }

}, { timestamps: true });

module.exports = mongoose.model("Feedback", feedbackSchema);
