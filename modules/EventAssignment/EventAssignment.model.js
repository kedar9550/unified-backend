const mongoose = require('mongoose');

const AssigneeSchema = new mongoose.Schema({
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
    roleAssigned: {
        type: String,
        required: true
    }
}, { _id: false });

const EventAssignmentSchema = new mongoose.Schema({
    assignmentType: {
        type: String,
        enum: ['Fest', 'Club', 'Other Event'],
        required: true
    },
    eventName: {
        type: String,
        trim: true,
        maxlength: 200
    },
    club: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Club'
    },
    assignees: {
        type: [AssigneeSchema],
        validate: [v => Array.isArray(v) && v.length > 0, 'At least one assignee is required']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('EventAssignment', EventAssignmentSchema);
