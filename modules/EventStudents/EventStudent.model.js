const mongoose = require('mongoose');

const EventStudentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  college: { type: String, required: true, trim: true },
  otherCollege: { type: String, trim: true },
  roll: { type: String, required: true, trim: true },
  gender: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  password: { type: String, default: '123456' }
}, { timestamps: true });

module.exports = mongoose.model('EventStudent', EventStudentSchema);
