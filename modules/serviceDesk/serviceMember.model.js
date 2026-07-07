const mongoose = require("mongoose");

const serviceMemberSchema = new mongoose.Schema({
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Service",
    required: true
  },

  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },

  roleType: {
    type: String,
    enum: ["SERVICE_ADMIN", "SERVICE_EMP"],
    required: true
  },

  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

// One employee can hold only one roleType per service (no duplicate assignment)
serviceMemberSchema.index({ service: 1, employee: 1, roleType: 1 }, { unique: true });

module.exports = mongoose.model("ServiceMember", serviceMemberSchema);
