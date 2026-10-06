const mongoose = require('mongoose');

const centralEventTypeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  hasCategories: {
    type: Boolean,
    default: false
  },
  hasLevels: {
    type: Boolean,
    default: false
  },
  allowedLevels: [{
    type: String,
    enum: ['STUDENT', 'FACULTY']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  banner: {
    url: { type: String, default: null },
    key: { type: String, default: null }
  }
}, {
  timestamps: true,
  collection: 'central_event_types'
});

module.exports = mongoose.model('CentralEventType', centralEventTypeSchema);
