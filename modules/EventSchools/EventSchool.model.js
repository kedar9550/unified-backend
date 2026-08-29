const mongoose = require('mongoose');

const EventSchoolSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Event School name is required'],
        trim: true,
        maxlength: [200, 'Event School name cannot exceed 200 characters']
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
        // required: [true, 'Banner image is required']
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
    orderNo: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true, collection: 'event_schools' });

module.exports = mongoose.model('EventSchool', EventSchoolSchema);
