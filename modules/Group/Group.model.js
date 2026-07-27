const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Group name is required'],
        trim: true,
        maxlength: [200, 'Group name cannot exceed 200 characters']
    },
    department: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'EventDepartment',
            required: [true, 'Department is required']
        }],
        validate: {
            validator: (value) => Array.isArray(value) && value.length > 0,
            message: 'At least one department is required.'
        }
    },
    content: {
        type: String,
        required: [true, 'Content is required'],
        trim: true,
        maxlength: [5000, 'Content cannot exceed 5000 characters']
    },
    logo: {
        type: String,
        required: [true, 'Group logo is required']
    },
    banner: {
        type: String,
        required: [true, 'Banner image is required']
    },
    eventCoordinator: {
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
