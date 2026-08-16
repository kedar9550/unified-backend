const mongoose = require('mongoose');

const ContributionSchema = new mongoose.Schema({
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
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ContributionCategory',
        required: true
    },
    
    // Dynamic fields populated depending on the category
    organizationName: { type: String }, // Cat 1
    memberType: { type: String }, // Cat 1 (BOG/GB/AC/BOS)
    fromDate: { type: Date }, // Cat 1
    toDate: { type: Date }, // Cat 1
    
    journalName: { type: String }, // Cat 2, 3
    journalType: { type: String }, // Cat 2, 3 (SCIE, Q1, Q2, ESCI, Q3, Q4, Conference proceedings)
    journalConferenceName: { type: String }, // Cat 3
    
    duration: { type: String }, // Cat 2, 3, 7, 11, 12
    
    awardName: { type: String }, // Cat 4, 5
    awardingAgency: { type: String }, // Cat 4, 5
    awardDate: { type: Date }, // Cat 4, 5
    
    courseName: { type: String }, // Cat 6, 11, 12
    url: { type: String }, // Cat 6
    
    certificationName: { type: String }, // Cat 7
    
    eventName: { type: String }, // Cat 8
    eventType: { type: String }, // Cat 8 (Hackathon/startup/Events)
    eventDate: { type: Date }, // Cat 8
    studentNames: { type: String }, // Cat 8
    
    articleTitle: { type: String }, // Cat 9
    publicationName: { type: String }, // Cat 9
    publicationDate: { type: Date }, // Cat 9
    
    facilityName: { type: String }, // Cat 10
    contributionType: { type: String }, // Cat 10 (Establishment/Maintenance)
    facilityDate: { type: Date }, // Cat 10
    
    grantName: { type: String }, // Cat 13 (deprecated, use grantTitle)
    grantType: { type: String }, // Cat 13
    grantTitle: { type: String }, // Cat 13
    fundingAgency: { type: String }, // Cat 13
    grantAmount: { type: Number }, // Cat 13
    sanctionDate: { type: Date }, // Cat 13

    courseHours: { type: Number }, // Cat 12
    certificateNumber: { type: String },
    
    proof: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Draft', 'Pending at HOD', 'Approved by HOD', 'Approved', 'Rejected'],
        default: 'Draft'
    },
    removedFromAppraisal: {
        type: Boolean,
        default: false
    },
    hodComment: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Contribution', ContributionSchema);
