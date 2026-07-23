const mongoose = require('mongoose');

const CoordinatorSchema = new mongoose.Schema({
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    department: { type: String, required: true },
    designation: { type: String, required: true },
    roleAssigned: { type: String, required: true, default: 'EVENT COORDINATOR' }
}, { _id: false });

const MajorEventSchema = new mongoose.Schema({
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EventGroup',
        required: true
    },
    groupName: { type: String, required: true, trim: true, maxlength: 120 },
    eventName: { type: String, required: true, trim: true, maxlength: 200 },
    coordinator: { type: CoordinatorSchema, required: true },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active',
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('MajorEvent', MajorEventSchema);