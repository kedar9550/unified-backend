const mongoose = require('mongoose');

const CoInvestigatorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: String, default: null },
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
    duration: { type: String, required: true },
    fundingAgency: { type: String, required: true },
    scheme: { type: String },
    otherInvestigators: { type: String },
    principalInvestigator: { type: String, enum: ['Yes', 'No'], required: true },
    coPrincipalInvestigator: { type: String, enum: ['Yes', 'No'], required: true },
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
    sanctionedAmount: { type: String, required: true },
    sanctionDate: { type: Date, required: true },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'], required: true },
    
    // Files
    sanctionOrder: { type: String, required: true },
    
    status: {
        type: String,
        enum: ['Pending at HOD', 'Pending at R&D', 'Approved', 'Rejected by HOD', 'Rejected by R&D'],
        default: 'Pending at HOD'
    },
    hodComment: { type: String },
    rndComment: { type: String },
    approvedAmount: { type: Number },
    
    appraisalClaimant: {
        type: String,
        default: null
    },
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
