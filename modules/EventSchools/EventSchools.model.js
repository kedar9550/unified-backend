const mongoose = require('mongoose');

const EventSchoolsSchema = new mongoose.Schema({
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
    },
    coordinator: {
        employeeId: {
            type: String,
            required: [true, 'Coordinator ID is required']
        },
        employeeName: {
            type: String,
            required: [true, 'Coordinator name is required']
        }
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    }
}, {
    timestamps: true,
    collection: 'event_schools'
});

const EventSchools = mongoose.model('EventSchools', EventSchoolsSchema);

module.exports = EventSchools;
