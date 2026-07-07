const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({

  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ticket",
    required: true
  },

  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },

  message: {
    type: String,
    required: true,
    trim: true
  },

  attachment: {
    fileName: String,
    storedName: String,
    filePath: String,
    fileType: String
  }

}, { timestamps: true });

commentSchema.index({ ticket: 1, createdAt: 1 });

// NOTE: comments belonging to a ticket are physically deleted (not just
// hidden) once the ticket is CLOSED — see ticket.controller.js closeTicket().
// This model has no soft-delete flag on purpose, matching the old app's
// "chat closed, history removed" behaviour.

module.exports = mongoose.model("Comment", commentSchema);
