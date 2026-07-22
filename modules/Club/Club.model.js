const mongoose = require('mongoose');

const CoordinatorSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        required: true
    },
    employeeName: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    designation: {
        type: String,
        required: true
    },
    role: {
        type: String,
        default: 'CLUB COORDINATOR'
    }
}, { _id: false });

const ClubSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    logo: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    coordinators: {
        type: [CoordinatorSchema],
        validate: [v => Array.isArray(v) && v.length > 0, 'At least one club coordinator is required']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Club', ClubSchema);
