const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Group name is required'],
        trim: true,
        maxlength: [200, 'Group name cannot exceed 200 characters']
    },
    shortName: {
        type: String,
        required: [true, 'Short name is required'],
        trim: true,
        maxlength: [100, 'Short name cannot exceed 100 characters']
    },

    content: {
        type: String,
        required: [true, 'Content is required'],
        trim: true,
        maxlength: [5000, 'Content cannot exceed 5000 characters']
    },
    banner: {
        type: String,
        required: [true, 'Banner image is required']
    },
    coordinator: {
        employeeId: {
            type: String,
            trim: true,
        },
        employeeName: {
            type: String,
            trim: true,
        },
        department: {
            type: String,
            trim: true,
        },
        designation: {
            type: String,
            trim: true,
        }
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);
