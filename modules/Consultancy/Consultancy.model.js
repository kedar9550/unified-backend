const mongoose = require('mongoose');

const CoInvestigatorSchema = new mongoose.Schema({
    role: { type: String }, // "Principal Investigator" or "Co-Investigator"
    affiliationType: { type: String },
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

    title: { type: String, required: true, unique: true },
    typeOfConsultancy: { type: String, enum: ['testing', 'design', 'training', 'individual'] },
    fundingIndustry: { type: String },
    fundingAdityaUniversity: { type: String, enum: ['Yes', 'No'], default: 'No' },
    amount: { type: String },
    receivedAmount: { type: String },
    receivedAmountDate: { type: Date },
    duration: { type: String },
    month: { type: String },
    year: { type: String },
    organization: { type: String }, // Legacy field fallback
    investigatorType: { type: String, enum: ['Principal Investigator (PI)', 'Co-Principal Investigator (Co-PI)'] },
    totalInvestigators: { type: Number, default: 1 },
    principalInvestigator: {
        type: String,
        enum: ['Yes', 'No']
    },
    coPrincipalInvestigator: {
        type: String,
        enum: ['Yes', 'No']
    },
    coInvestigators: [CoInvestigatorSchema],
    applyIncentive: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'No'
    },
    estimatedIncentiveAmount: {
        type: Number,
        default: 0
    },
    appraisalClaimants: [{ type: String }],
    incentiveClaimant: {
        type: String,
        default: null
    },

    status: {
        type: String,
        enum: ['Pending', 'Rejected', 'Pending at R&D', 'Approved', 'Rejected by R&D'],
        default: 'Pending'
    },
    sanctionLetter: { type: String, default: null },
    mou: { type: String, default: null },
    hodComment: { type: String },
    rndComment: { type: String },
    approvedAmount: { type: Number },
    appraisalEligible: {
        type: String,
        enum: ['Yes', 'No'],
        default: null
    },
    entryType: {
        type: String,
        enum: ['Self', 'Admin'],
        default: 'Self'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

ConsultancySchema.pre('save', function () {
    if (!this.fundingIndustry && this.organization) {
        this.fundingIndustry = this.organization;
    }
    if (!this.totalInvestigators || this.totalInvestigators < 1) {
        this.totalInvestigators = (this.coInvestigators && this.coInvestigators.length > 0) ? (this.coInvestigators.length + 1) : 1;
    }
    if (this.investigatorType) {
        if (this.investigatorType === 'Principal Investigator (PI)' || this.investigatorType === 'Principal Investigator') {
            this.principalInvestigator = 'Yes';
            this.coPrincipalInvestigator = 'No';
        } else if (this.investigatorType === 'Co-Principal Investigator (Co-PI)' || this.investigatorType === 'Co-Principal Investigator') {
            this.principalInvestigator = 'No';
            this.coPrincipalInvestigator = 'Yes';
        }
    } else if (this.principalInvestigator) {
        if (this.principalInvestigator === 'Yes') {
            this.investigatorType = 'Principal Investigator (PI)';
            this.coPrincipalInvestigator = 'No';
        } else if (this.principalInvestigator === 'No') {
            this.investigatorType = 'Co-Principal Investigator (Co-PI)';
            this.coPrincipalInvestigator = 'Yes';
        }
    }
});

module.exports = mongoose.model('Consultancy', ConsultancySchema);
