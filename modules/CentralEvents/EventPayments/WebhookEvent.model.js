const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  _id: {
    type: String, // x-razorpay-event-id
    required: true
  },
  type: {
    type: String,
    required: true
  },
  receivedAt: {
    type: Date,
    default: Date.now,
    expires: 30 * 24 * 60 * 60 // 30 days TTL in seconds
  }
}, {
  timestamps: false,
  collection: 'webhook_events',
  _id: false
});

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
