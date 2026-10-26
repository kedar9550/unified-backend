const mongoose = require('mongoose');

const ActivityHubRegistrationSchema = new mongoose.Schema({
  activity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActivityHubActivity',
    required: [true, 'Activity reference is required'],
    index: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student reference is required'],
    index: true
  },
  rollNumber: {
    type: String,
    required: [true, 'Student roll number is required'],
    uppercase: true,
    trim: true,
    index: true
  },
  studentName: {
    type: String,
    trim: true,
    default: ''
  },
  department: {
    type: String,
    trim: true,
    default: ''
  },
  branch: {
    type: String,
    trim: true,
    default: ''
  },
  semester: {
    type: Number,
    default: null
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['Registered', 'Attended', 'Cancelled'],
    default: 'Registered',
    index: true
  },
  registeredAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'activity_hub_registrations' // Isolated registrations collection
});

// Enforce single registration per student per activity at database level
ActivityHubRegistrationSchema.index({ activity: 1, student: 1 }, { unique: true });
ActivityHubRegistrationSchema.index({ activity: 1, rollNumber: 1 }, { unique: true });
ActivityHubRegistrationSchema.index({ activity: 1, registeredAt: -1 });

module.exports = mongoose.model('ActivityHubRegistration', ActivityHubRegistrationSchema);
