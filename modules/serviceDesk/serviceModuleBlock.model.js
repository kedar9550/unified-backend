const mongoose = require("mongoose");

const serviceModuleBlockSchema = new mongoose.Schema({
  blockName: {
    type: String,
    required: true,
    trim: true
  },
  blockCode: {
    type: String,
    required: true,
    uppercase: true,
    unique: true,
    trim: true
  },
  blockType: {
    type: String,
    enum: ["ACADEMIC", "HOSTEL"],
    default: "ACADEMIC"
  },
  genderTag: {
    type: String,
    enum: ["BOYS", "GIRLS", "NONE"],
    default: "NONE"
  },
  description: {
    type: String,
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
}, { timestamps: true });

module.exports = mongoose.model("ServiceModuleBlock", serviceModuleBlockSchema, "servicemoduleblocks");
