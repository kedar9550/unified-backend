const mongoose = require("mongoose");

const StudentDataSchema = new mongoose.Schema(
  {
    rollNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    dept: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    branch: {
      type: String,
      trim: true,
    },
    program: {
      type: String,
      trim: true,
    },
    assignedDept: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    semester: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ["unassigned", "assigned"],
      default: "unassigned",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudentData", StudentDataSchema);
