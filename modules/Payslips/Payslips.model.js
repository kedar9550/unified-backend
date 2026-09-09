const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema(
  {
    emp_id: {
      type: mongoose.Schema.Types.Mixed,
      index: true,
    },
    empid: {
      type: mongoose.Schema.Types.Mixed,
      index: true,
    },
    empId: {
      type: mongoose.Schema.Types.Mixed,
      index: true,
    },
    emp_name: {
      type: String,
    },
    name: {
      type: String,
    },
    department: {
      type: String,
    },
    college: {
      type: String,
    },
    email: {
      type: String,
      default: '',
    },
    designation: {
      type: String,
    },
    month: {
      type: String,
      required: true,
    },
    year: {
      type: mongoose.Schema.Types.Mixed,
    },
    basic_salary: {
      type: mongoose.Schema.Types.Mixed,
    },
    basicPay: {
      type: mongoose.Schema.Types.Mixed,
    },
    allowances: {
      type: mongoose.Schema.Types.Mixed,
    },
    total_earnings: {
      type: mongoose.Schema.Types.Mixed,
    },
    grossAmount: {
      type: mongoose.Schema.Types.Mixed,
    },
    total_deductions: {
      type: mongoose.Schema.Types.Mixed,
    },
    deductions: {
      type: mongoose.Schema.Types.Mixed,
    },
    net_salary: {
      type: mongoose.Schema.Types.Mixed,
    },
    netSalary: {
      type: mongoose.Schema.Types.Mixed,
    },
    pdfUrl: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Published', 'Pending', 'Draft'],
      default: 'Published',
    },
  },
  {
    collection: 'payslip',
    strict: false,
    timestamps: true,
  }
);

module.exports = mongoose.model('Payslip', payslipSchema);

