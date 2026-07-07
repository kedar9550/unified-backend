const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({

  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ticket",
    required: true
  },

  action: {
    type: String,
    required: true // e.g. TICKET_CREATED, TICKET_ASSIGNED, STATUS_UPDATED, TICKET_REJECTED, TICKET_CLOSED
  },

  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }

}, { timestamps: true });

activitySchema.index({ ticket: 1, createdAt: 1 });

module.exports = mongoose.model("Activity", activitySchema);
