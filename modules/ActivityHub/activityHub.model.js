const mongoose = require('mongoose');

const ActivityHubSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Activity title is required'],
    trim: true
  },
  activityType: {
    type: String,
    required: [true, 'Activity type is required'],
    enum: [
      'Workshop',
      'Guest Lecture',
      'Industrial Visit',
      'Value Added Course',
      'Capacity Development',
      'Professional Body Activity',
      'Alumni Interaction',
      'FDP/PDP',
      'Club Activity',
      'Extension & Outreach',
      'Entrepreneurship Event'
    ]
  },
  academicYear: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null
  },
  academicYearName: {
    type: String,
    trim: true,
    default: ''
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },
  departmentName: {
    type: String,
    trim: true,
    default: ''
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  registrationDeadline: {
    type: Date,
    default: null
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  maxParticipants: {
    type: Number,
    default: 0 // 0 means unlimited
  },
  // Dynamic type-specific details
  typeDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // CRITICAL REQUIREMENT: Persistent Enable/Disable status (defaults to false)
  isEnabled: {
    type: Boolean,
    default: false,
    index: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Published', 'Archived'],
    default: 'Draft',
    index: true
  },
  registrationCount: {
    type: Number,
    default: 0
  },
  // Creator details (Auditing & Scoping)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  createdByName: {
    type: String,
    default: ''
  },
  createdByEmail: {
    type: String,
    default: ''
  },
  createdByEmpId: {
    type: String,
    default: ''
  },
  creatorDepartment: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  collection: 'activity_hub_activities' // Completely separate from legacy central_event_academic_activities
});

// Compound indexes for high-speed student portal queries and management filtering
ActivityHubSchema.index({ isEnabled: 1, status: 1, startDate: 1, endDate: 1 });
ActivityHubSchema.index({ department: 1, academicYear: 1 });
ActivityHubSchema.index({ createdBy: 1, isEnabled: 1 });

module.exports = mongoose.model('ActivityHubActivity', ActivityHubSchema);
