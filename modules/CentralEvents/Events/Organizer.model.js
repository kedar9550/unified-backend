const mongoose = require('mongoose');

const organizerSchema = new mongoose.Schema({
  scope: {
    type: String,
    enum: ['DEPARTMENT', 'UNIVERSITY'],
    required: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'organizers'
});

organizerSchema.index({ scope: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Organizer', organizerSchema);
