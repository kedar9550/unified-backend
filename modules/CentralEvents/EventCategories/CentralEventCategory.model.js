const mongoose = require('mongoose');

const centralEventCategorySchema = new mongoose.Schema({
  typeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CentralEventType',
    required: true
  },
  typeCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
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
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  coordinator: {
    empId: { type: String, trim: true, default: null },
    name: { type: String, trim: true, default: null },
    designation: { type: String, trim: true, default: null },
    department: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, default: null }
  },
  coordinators: [{
    empId: { type: String, trim: true },
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true }
  }],
  banner: {
    url: { type: String, default: null },
    key: { type: String, default: null }
  }
}, {
  timestamps: true,
  collection: 'central_event_categories'
});

centralEventCategorySchema.index({ typeId: 1, code: 1 }, { unique: true });
centralEventCategorySchema.index({ typeCode: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('CentralEventCategory', centralEventCategorySchema);
