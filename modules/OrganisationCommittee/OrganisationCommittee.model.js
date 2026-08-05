const mongoose = require('mongoose');

const OrganisationCommitteeSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: [true, 'Employee is required']
    },
    role: {
        type: String,
        enum: ['Convener', 'Co-convener'],
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
