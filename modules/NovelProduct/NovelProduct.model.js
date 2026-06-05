const mongoose = require('mongoose');

const CoDeveloperSchema = new mongoose.Schema({
    name: { type: String, required: true },
    affiliation: { type: String, required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    principalInvestigator: { type: String, enum: ['Yes', 'No'], default: 'No' },
    coPrincipalInvestigator: { type: String, enum: ['Yes', 'No'], default: 'Yes' }
}, { _id: false });

const NovelProductSchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
        index: true
    },
    academicYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
        index: true
    },
    productName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        enum: ['Developed', 'Implemented'],
        required: true
    },
    organizationName: {
        type: String,
        trim: true
    },
    document: {
        type: String, // Path of uploaded proof document
        required: true
    },
    remarks: {
        type: String,
        trim: true
    },
    principalInvestigator: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'Yes'
    },
    coPrincipalInvestigator: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'No'
    },
    coDevelopers: [CoDeveloperSchema],
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
    hodComment: {
        type: String
    },
    rndComment: {
        type: String
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('NovelProduct', NovelProductSchema);
