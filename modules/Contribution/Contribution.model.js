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
        type: Number, // 1 to 13
        required: true
    },
    
    // Dynamic fields populated depending on the category
    organizationName: { type: String }, // Cat 1
    fromDate: { type: Date }, // Cat 1
    toDate: { type: Date }, // Cat 1
    
    journalName: { type: String }, // Cat 2, 3
    journalConferenceName: { type: String }, // Cat 3
    
    duration: { type: String }, // Cat 2, 3, 7, 11, 12
    
    awardName: { type: String }, // Cat 4, 5
    awardDate: { type: Date }, // Cat 4, 5
    
    courseName: { type: String }, // Cat 6, 11, 12
    url: { type: String }, // Cat 6
    
    certificationName: { type: String }, // Cat 7
    
    eventName: { type: String }, // Cat 8
    eventDate: { type: Date }, // Cat 8
    
    articleTitle: { type: String }, // Cat 9
    publicationName: { type: String }, // Cat 9
    publicationDate: { type: Date }, // Cat 9
    
    facilityName: { type: String }, // Cat 10
    facilityDate: { type: Date }, // Cat 10
    
    grantName: { type: String }, // Cat 13
    sanctionDate: { type: Date }, // Cat 13

    courseHours: { type: Number }, // Cat 12
    certificateNumber: { type: String },
    
    proof: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Draft', 'Pending at HOD', 'Approved', 'Rejected'],
        default: 'Draft'
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
