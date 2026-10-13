const mongoose = require('mongoose');

const CentralEventOrganisationCommitteeSchema = new mongoose.Schema({
  event_type: {
    type: String,
    required: [true, 'Event type is required'],
    uppercase: true,
    trim: true,
    default: 'VEDA'
  },
  typeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CentralEventType',
    default: null
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: function() { return this.role !== 'Student Coordinator'; }
  },
  rollNo: {
    type: String,
    trim: true,
    uppercase: true,
    required: function() { return this.role === 'Student Coordinator'; }
  },
  role: {
    type: String,
    enum: ['Convener', 'Member', 'Student Coordinator'],
    required: [true, 'Role is required']
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  },
  orderNumber: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: false
  }
}, {
  timestamps: true,
  collection: 'central_event_organisationcommittees'
});

// Index for efficient querying by event_type and role
CentralEventOrganisationCommitteeSchema.index({ event_type: 1, role: 1 });

module.exports = mongoose.model('CentralEventOrganisationCommittee', CentralEventOrganisationCommitteeSchema);
