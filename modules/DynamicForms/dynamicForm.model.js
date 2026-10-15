const mongoose = require('mongoose');

const fieldOptionSchema = new mongoose.Schema({
  label: { type: String, required: true },
  value: { type: String, required: true }
}, { _id: false });

const formFieldSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: [
      'text',
      'textarea',
      'number',
      'email',
      'phone',
      'password',
      'select',
      'radio',
      'checkbox',
      'date',
      'file',
      'yesno',
      'heading',
      'paragraph',
      'divider'
    ]
  },
  label: { type: String, default: '' },
  name: { type: String, required: true },
  placeholder: { type: String, default: '' },
  helpText: { type: String, default: '' },
  required: { type: Boolean, default: false },
  defaultValue: { type: mongoose.Schema.Types.Mixed, default: '' },
  minLength: { type: Number },
  maxLength: { type: Number },
  min: { type: Number },
  max: { type: Number },
  options: [fieldOptionSchema],
  acceptedFileTypes: { type: String, default: 'image/*,.pdf,.doc,.docx' },
  maxFileSizeMB: { type: Number, default: 10 },
  readOnly: { type: Boolean, default: false },
  hidden: { type: Boolean, default: false },
  columnWidth: { type: String, enum: ['full', 'half'], default: 'full' },
  section: { type: String, default: '' },
  validationRule: { type: String, default: '' },
  errorMessage: { type: String, default: '' }
}, { _id: false });

const formSectionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' }
}, { _id: false });

const dynamicFormSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Form title is required'],
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  slug: {
    type: String,
    required: [true, 'Form slug is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  fields: [formFieldSchema],
  sections: [formSectionSchema],
  settings: {
    submitButtonText: { type: String, default: 'Submit Form' },
    successMessage: { type: String, default: 'Thank you! Your response has been submitted successfully.' },
    startDate: { type: Date },
    endDate: { type: Date },
    isPublic: { type: Boolean, default: true },
    allowMultipleSubmissions: { type: Boolean, default: true },
    layout: { type: String, enum: ['single-column', 'two-column'], default: 'two-column' }
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true
  },
  submissionCount: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  publishedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DynamicForm', dynamicFormSchema);
