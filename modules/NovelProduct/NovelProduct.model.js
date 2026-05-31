const mongoose = require('mongoose');

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
        // Will be validated as mandatory in controller/front-end when category is 'Implemented'
    },
    document: {
        type: String, // Path of uploaded proof document
        required: true
    },
    remarks: {
        type: String,
        trim: true
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
