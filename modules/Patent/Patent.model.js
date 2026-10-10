const mongoose = require('mongoose');

const CoInventorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: String, default: null },
    studentId: { type: String, default: null },
    CoInventorType: { type: String, default: 'faculty' }
}, { _id: false });

const PatentSchema = new mongoose.Schema({
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
    facultyRole: { type: String, enum: ['Applicant', 'Inventor / Co-Inventor'], default: 'Applicant' },
    applicantName: { type: String, required: true },
    applicantAffiliation: { type: String },
    patentName: { type: String, required: true },
    area: { type: String, required: true },
    applicationNo: { type: String, required: true, unique: true },
    dateOfFiling: { type: Date },
    patentFiledCountry: { type: String, required: true, default: 'India' },
    patentFiledInInstitution: { type: String, enum: ['Yes', 'No'], default: 'Yes' },
    isUtilityType: { type: String, enum: ['Yes', 'No'], default: 'Yes' },
    isInstitutionRecord: { type: String, enum: ['Yes', 'No'], default: 'No' },
    patentStatus: { type: String, enum: ['Published', 'Granted'], required: true },
    
    published: {
        publishedstatus: { type: String, enum: ['yes', 'no'], default: 'no' },
        publishedexpectedamount: { type: Number },
        publishedinsentiveamount: { type: Number },
        publisheddate: { type: Date },
        publishedinsentiveappllieddate: { type: Date }
    },

    granted: {
        grantedstatus: { type: String, enum: ['yes', 'no'], default: 'no' },
        grantedexpectedamount: { type: Number },
        grantedinsentiveamount: { type: Number },
        granteddate: { type: Date },
        grantedinsentiveappllieddate: { type: Date }
    },
    coInventors: [CoInventorSchema],
    isStudentsInvolved: { type: String, enum: ['Yes', 'No'], default: 'No' },
    month: { type: String },
    year: { type: String },
    applyIncentive: { type: String, enum: ['Yes', 'No'], required: true },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'], required: true },
    eligibleForTechTransfer: { type: String, enum: ['Yes', 'No'], default: 'No' },
    
    // Files
    cbr: { type: String, required: true },
    form1: { type: String, required: true },
    grantedCertificate: { type: String },
    
    status: {
        type: String,
        enum: ['Pending', 'Rejected', 'Pending at R&D', 'Approved', 'Rejected by R&D'],
        default: 'Pending'
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

module.exports = mongoose.model('Patent', PatentSchema);
