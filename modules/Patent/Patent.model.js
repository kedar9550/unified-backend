const mongoose = require('mongoose');

const CoInventorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null }
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
    
    title: { type: String, required: true },
    applicantName: { type: String, required: true },
    patentName: { type: String, required: true },
    area: { type: String, required: true },
    filingNo: { type: String, required: true },
    dateOfFiling: { type: Date, required: true },
    patentStatus: { type: String, required: true }, // 'Filed', 'Published', etc.
    coInventors: [CoInventorSchema],
    month: { type: String, required: true },
    year: { type: String, required: true },
    applyIncentive: { type: String, enum: ['Yes', 'No'], required: true },
    applyingSeedGrant: { type: String, enum: ['Yes', 'No'], required: true },
    
    // Files
    eFilingReceipt: { type: String, required: true },
    form1: { type: String, required: true },
    
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

module.exports = mongoose.model('Patent', PatentSchema);
