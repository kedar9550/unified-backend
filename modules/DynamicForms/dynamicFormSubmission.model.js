const mongoose = require('mongoose');

const dynamicFormSubmissionSchema = new mongoose.Schema({
  formId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DynamicForm',
    required: true,
    index: true
  },
  formSlug: {
    type: String,
    required: true,
    index: true
  },
  submittedData: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    default: {}
  },
  submissionStatus: {
    type: String,
    enum: ['submitted', 'reviewed', 'flagged', 'archived'],
    default: 'submitted',
    index: true
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  submittedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DynamicFormSubmission', dynamicFormSubmissionSchema);
