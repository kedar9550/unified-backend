const mongoose = require('mongoose');

const ConvenerSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        required: true
    },
    employeeName: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    designation: {
        type: String,
        required: true
    },
    role: {
        type: String,
        default: 'Convener'
    }
}, { _id: false });

const EventsSchema = new mongoose.Schema({
    eventName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    bannerImage: {
        type: String,
        required: true
    },
    conveners: {
        type: [ConvenerSchema],
        validate: [v => Array.isArray(v) && v.length > 0, 'At least one convener is required']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Events', EventsSchema);
