const mongoose = require('mongoose');

const OrganisationCommitteeSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: function() { return this.role !== 'Student Coordinator'; }
    },
    rollNo: {
        type: String,
        required: function() { return this.role === 'Student Coordinator'; }
    },
    role: {
        type: String,
        enum: ['Convener', 'Co-convener', 'Student Coordinator'],
        required: [true, 'Role is required']
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: false
    }
}, { timestamps: true });

module.exports = mongoose.model('OrganisationCommittee', OrganisationCommitteeSchema);
