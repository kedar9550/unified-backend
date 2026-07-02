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

const FundedProjectSchema = new mongoose.Schema({
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
    duration: { type: String },
    fundingAgency: { type: String },
    fundingAgencyAditya: { type: String, enum: ['Yes', 'No'], default: 'No' },
    scheme: { type: String },
    otherInvestigators: { type: String },
    investigatorType: { type: String, enum: ['Principal Investigator (PI)', 'Co-Principal Investigator (Co-PI)'] },
    principalInvestigator: { type: String, enum: ['Yes', 'No'] },
    coPrincipalInvestigator: { type: String, enum: ['Yes', 'No'] },
    coInvestigators: [CoInvestigatorSchema],
    projectStatus: {
        type: String,
        enum: ['Shortlisted', 'Sanctioned'],
        default: 'Sanctioned'
    },
    applyIncentive: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'No'
    },
    recurring: { type: String },
    nonRecurring: { type: String },
    sanctionedAmount: { type: String },
    sanctionDate: { type: Date },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'] },
    
    // Files
    sanctionOrder: { type: String },
    
    status: {
        type: String,
        enum: ['Pending at HOD', 'Pending at R&D', 'Approved', 'Rejected by HOD', 'Rejected by R&D'],
        default: 'Pending at HOD'
    },
    hodComment: { type: String },
    rndComment: { type: String },
    approvedAmount: { type: Number },
    
    appraisalClaimants: [{ type: String }],
    incentiveClaimant: {
        type: String,
        default: null
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('FundedProject', FundedProjectSchema);
