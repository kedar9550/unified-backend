const mongoose = require('mongoose');

const CoInvestigatorSchema = new mongoose.Schema({
    role: { type: String }, // "Principal Investigator" or "Co-Investigator"
    affiliationType: { type: String, enum: ['AUS', 'Others'] },
    employeeId: { type: String, default: null },
    name: { type: String },
    affiliation: { type: String, default: null },
    department: { type: String, default: null },
    designation: { type: String, default: null },
    principalInvestigator: { type: String, enum: ['Yes', 'No'], default: 'No' },
    coPrincipalInvestigator: { type: String, enum: ['Yes', 'No'], default: 'Yes' }
}, { _id: false });

const ConsultancySchema = new mongoose.Schema({
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
    college: { type: String },
    panNumber: { type: String },
    
    title: { type: String, required: true },
    organization: { type: String, required: true },
    amount: { type: String, required: true },
    duration: { type: String },
    month: { type: String },
    year: { type: String },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'], required: true },
    investigatorType: { type: String, enum: ['Principal Investigator (PI)', 'Co-Principal Investigator (Co-PI)'] },
    principalInvestigator: {
        type: String,
        enum: ['Yes', 'No']
    },
    coPrincipalInvestigator: {
        type: String,
        enum: ['Yes', 'No']
    },
    projectStatus: {
        type: String,
        enum: ['Shortlisted', 'Sanctioned'],
        default: 'Sanctioned'
    },
    coInvestigators: [CoInvestigatorSchema],
    applyIncentive: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'No'
    },
    appraisalClaimant: {
        type: String,
        default: null
    },
    incentiveClaimant: {
        type: String,
        default: null
    },
    
    status: {
        type: String,
        enum: ['Pending at HOD', 'Pending at R&D', 'Approved', 'Rejected by HOD', 'Rejected by R&D'],
        default: 'Pending at HOD'
    },
    hodComment: { type: String },
    rndComment: { type: String },
    approvedAmount: { type: Number },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Consultancy', ConsultancySchema);
