const mongoose = require('mongoose');

const coordinatorSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  empId: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true }
}, { _id: false });

const resourcePersonSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  designation: { type: String, trim: true },
  organization: { type: String, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  photoUrl: { type: String, trim: true }
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  key: { type: String },
  size: { type: Number },
  mime: { type: String }
}, { _id: false });

const centralEventSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  typeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CentralEventType',
    required: true
  },
  typeCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CentralEventCategory',
    default: null
  },
  categoryName: {
    type: String,
    default: null
  },
  academicYear: {
    type: String,
    trim: true,
    default: null
  },
  level: {
    type: String,
    enum: ['STUDENT', 'FACULTY', null],
    default: null
  },
  activityType: {
    type: String,
    enum: ['WORKSHOP', 'SEMINAR', 'FDP', 'STTP', null],
    default: null
  },
  organizer: {
    organizerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organizer', default: null },
    scope: { type: String, enum: ['DEPARTMENT', 'UNIVERSITY', null], default: null },
    name: { type: String, default: null }
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  titleLower: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  inAssociationWith: [{ type: String, trim: true }],
  outcomes: [{ type: String, trim: true }],
  rules: {
    type: [{ type: String, trim: true }],
    validate: [v => v.length <= 50, 'Rules cannot exceed 50 items']
  },
  mode: {
    type: String,
    enum: ['ONLINE', 'OFFLINE', 'HYBRID'],
    required: true,
    default: 'OFFLINE'
  },
  venue: {
    name: { type: String, trim: true },
    address: { type: String, trim: true },
    link: { type: String, trim: true }
  },
  participation: {
    type: {
      type: String,
      enum: ['TEAM', 'SINGLE'],
      required: true,
      default: 'SINGLE'
    },
    minTeamSize: { type: Number, default: 1 },
    maxTeamSize: { type: Number, default: 1 }
  },
  fee: {
    amount: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'INR' }
  },
  schedule: {
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    regDeadline: { type: Date, required: true }
  },
  eligibility: {
    years: [{ type: Number }],
    branches: [{ type: String, trim: true }],
    genders: [{ type: String, trim: true }],
    nationalities: [{ type: String, trim: true }]
  },
  coordinators: {
    faculty: [coordinatorSchema],
    school: [coordinatorSchema]
  },
  resourcePersons: {
    type: [resourcePersonSchema],
    validate: [v => v.length <= 20, 'Resource persons cannot exceed 20']
  },
  banner: {
    url: { type: String },
    key: { type: String }
  },
  attachments: {
    type: [attachmentSchema],
    validate: [v => v.length <= 10, 'Attachments cannot exceed 10']
  },
  capacity: {
    type: Number,
    required: true,
    default: 100
  },
  registrationCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED'],
    default: 'DRAFT'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  schemaVersion: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  collection: 'central_events'
});

// Indexes
centralEventSchema.index({ typeCode: 1, categoryId: 1, status: 1, "schedule.fromDate": 1 });
centralEventSchema.index({ typeCode: 1, level: 1, activityType: 1, status: 1, "schedule.fromDate": 1 });
centralEventSchema.index({ "organizer.organizerId": 1, status: 1, "schedule.fromDate": -1 });
centralEventSchema.index({ typeId: 1, categoryId: 1, titleLower: 1, "schedule.fromDate": 1 }, { unique: true });
centralEventSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model('CentralEvent', centralEventSchema);
