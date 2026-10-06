const mongoose = require('mongoose');

const centralEventPaymentSchema = new mongoose.Schema({
  registrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CentralEventRegistration',
    required: true
  },
  centralEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CentralEvent',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['CREATED', 'PAID', 'FAILED', 'EXPIRED'],
    default: 'CREATED'
  },
  payTokenHash: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  razorpay: {
    orderId: { type: String, default: null },
    paymentId: { type: String, default: null }
  },
  transactionId: { type: String, default: null },
  paidAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'payments'
});

centralEventPaymentSchema.index({ payTokenHash: 1 }, { unique: true });
centralEventPaymentSchema.index(
  { registrationId: 1 },
  { unique: true, partialFilterExpression: { status: 'CREATED' } }
);
centralEventPaymentSchema.index(
  { 'razorpay.orderId': 1 },
  { unique: true, partialFilterExpression: { 'razorpay.orderId': { $type: 'string' } } }
);
centralEventPaymentSchema.index(
  { 'razorpay.paymentId': 1 },
  { unique: true, partialFilterExpression: { 'razorpay.paymentId': { $type: 'string' } } }
);
centralEventPaymentSchema.index({ userId: 1, createdAt: -1 });
centralEventPaymentSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('CentralEventPayment', centralEventPaymentSchema);
