const mongoose = require('mongoose');

const ParticipantSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  college: { type: String, trim: true },
  branch: { type: String, trim: true },
  otherCollege: { type: String, trim: true },
  photoUrl: { type: String, trim: true },
  roll: { type: String, trim: true },
  gender: { type: String, trim: true },
  mobile: { type: String, trim: true },
  email: { type: String, trim: true },
  year: { type: String, trim: true },
  accommodation: { type: String, trim: true, default: "No" },
  department: { type: String, trim: true },
  location: { type: String, trim: true },
  accommodationPayment: {
    paid: { type: Boolean, default: false },
    amount: { type: Number },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    paidAt: { type: Date }
  },
  barcode: { type: String, trim: true, sparse: true, unique: true },
  attended: { type: Boolean, default: false },
  accommodationCheckedIn: { type: Boolean, default: false },
  scanCount: { type: Number, default: 0 }
}, { _id: false });

const PaymentRegistrationSchema = new mongoose.Schema({
  eventId: { type: String, trim: true },
  schoolId: { type: String, trim: true },
  category: { type: String, trim: true },
  eventName: { type: String, trim: true },
  amount: { type: Number, default: 0 },
  amountRupees: { type: Number, default: 0 },
  currency: { type: String, default: 'INR', trim: true },
  teamId: { type: String, trim: true },
  teamSize: { type: Number, default: 1 },
  isFirstWinner: { type: Boolean, default: false },
  isSecondWinner: { type: Boolean, default: false },
  isThirdWinner: { type: Boolean, default: false },
  participants: { type: [ParticipantSchema], default: [] },
  receipt: { type: String, trim: true },
  razorpayOrderId: { type: String, trim: true, required: true },
  razorpayPaymentId: { type: String, trim: true, required: true },
  razorpaySignature: { type: String, trim: true, required: true },
  paymentStatus: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PAID' },
  verified: { type: Boolean, default: true },
  paidAt: { type: Date, default: Date.now },
  rawPaymentData: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

module.exports = mongoose.model('PaymentRegistration', PaymentRegistrationSchema);
