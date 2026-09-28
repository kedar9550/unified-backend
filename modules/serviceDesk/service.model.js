const mongoose = require("mongoose");
const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  description: {
    type: String,
    default: ""
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  isGlobalService: {
    type: Boolean,
    default: true
  },

  applicableBlockType: {
    type: String,
    enum: ["ALL", "ACADEMIC", "HOSTEL"],
    default: "ALL"
  },

  directEmployeeInvolvement: {
    type: Boolean,
    default: true
  },

  subcategories: {
    type: [String],
    default: []
  }

}, { timestamps: true });

module.exports = mongoose.model("Service", serviceSchema);
