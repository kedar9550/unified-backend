const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId },
  name: { type: String, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  rollNumber: { type: String, trim: true }
}, { _id: false });

const centralEventRegistrationSchema = new mongoose.Schema({
  centralEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CentralEvent',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  userType: {
    type: String,
    enum: ['Student', 'Employee'],
    default: 'Student'
  },
  teamName: {
    type: String,
    default: null
  },
  members: [memberSchema],
  payment: {
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CentralEventPayment' },
    status: { type: String, enum: ['FREE', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'], default: 'PENDING' },
    amount: { type: Number, default: 0 },
    paidAt: { type: Date, default: null }
  },
  status: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'CANCELLED'],
    default: 'PENDING'
  }
}, {
  timestamps: true,
  collection: 'central_event_registrations'
});

centralEventRegistrationSchema.index({ centralEventId: 1, userId: 1 }, { unique: true });
centralEventRegistrationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CentralEventRegistration', centralEventRegistrationSchema);
