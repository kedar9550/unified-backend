const mongoose = require("mongoose");

const serviceWorkerSchema = new mongoose.Schema({
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Service",
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    default: ""
  },
  designation: {
    type: String,
    trim: true,
    default: "" // e.g. "Electrician", "Plumber", "Carpenter", "AC Technician", "Cleaner"
  },
  notes: {
    type: String,
    trim: true,
    default: ""
  },
  status: {
    type: String,
    enum: ["ACTIVE", "INACTIVE"],
    default: "ACTIVE"
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  }
}, { 
  timestamps: true,
  collection: "serviceworkers" 
});

serviceWorkerSchema.index({ service: 1, status: 1 });

module.exports = mongoose.model("ServiceWorker", serviceWorkerSchema);
