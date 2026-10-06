const mongoose = require("mongoose");

const serviceDeskStudentSchema = new mongoose.Schema({
  rollno: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  studentname: {
    type: String,
    required: true,
    trim: true
  },
  studentstatus: {
    type: String,
    required: true,
    trim: true // "Regular", "Alumini", "Detained", etc.
  },
  mobilenumber: {
    type: String,
    required: true,
    trim: true
  },
  coursename: {
    type: String,
    default: "",
    trim: true
  },
  branch: {
    type: String,
    default: "",
    trim: true
  },
  gender: {
    type: String,
    default: "",
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // Auth & OTP state
  otp: {
    type: String,
    default: null
  },
  otpExpiry: {
    type: Date,
    default: null
  },
  lastLoginAt: {
    type: Date,
    default: Date.now
  },
  fcmIds: {
    type: [String],
    default: []
  }
}, { 
  timestamps: true,
  collection: "servicedesk_students"
});

serviceDeskStudentSchema.index({ mobilenumber: 1 });

module.exports = mongoose.model("ServiceDeskStudent", serviceDeskStudentSchema);
