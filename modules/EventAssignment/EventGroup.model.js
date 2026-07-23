const mongoose = require('mongoose');

const MajorEventAdminSchema = new mongoose.Schema({
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    department: { type: String, required: true },
    designation: { type: String, required: true },
    roleAssigned: { type: String, required: true, default: 'MAJOR EVENT ADMIN' }
}, { _id: false });

const EventGroupSchema = new mongoose.Schema({
    groupName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active',
        required: true
    },
    assignedFestName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    majorEventAdmin: {
        type: MajorEventAdminSchema,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('EventGroup', EventGroupSchema);