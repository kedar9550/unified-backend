const mongoose = require('mongoose');

const ResourceUtilizationSchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true
    },
    activityCategory: {
        type: String,
        required: true
    },
    activityType: {
        type: String,
        required: true
    },
    organizationName: {
        type: String,
        required: true
    },
    eventStartDate: {
        type: Date,
        required: true
    },
    eventEndDate: {
        type: Date,
        required: true
    },
    proof: {
        type: String,
        required: true
    },
    remarks: {
        type: String
    },
    numberOfSessions: {
        type: Number
    },
    numberOfDaysParticipated: {
        type: Number
    },
    numberOfDaysOrganized: {
        type: Number
    },
    courseFdpName: {
        type: String
    },
    organizingInstitutionCategory: {
        type: String
    },
    location: {
        type: String
    },
    labName: {
        type: String
    },
    universityName: {
        type: String
    },
    instituteName: {
        type: String
    },
    nirfRank: {
        type: Number
    },
    status: {
        type: String,
        enum: ['Draft', 'Pending at HOD', 'Approved', 'Rejected'],
        default: 'Draft'
    },
    removedFromAppraisal: {
        type: Boolean,
        default: false
    },
    certificateNumber: {
        type: String
    },
    hodComment: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ResourceUtilization', ResourceUtilizationSchema);
