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

const FacultyCoordinatorSchema = new mongoose.Schema({
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
    },
}, { _id: false });

const EventsSchema = new mongoose.Schema({
    eventName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    department: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    price: {
        type: Number,
        default: 0,
        min: 0
    },
    maxTeamSize: {
        type: Number,
        required: true,
        min: 1
    },
    venue: {
        type: String,
        required: true,
        trim: true,
        maxlength: 300
    },
    extraTeamSize: {
        type: Number,
        default: 0,
        min: 0
    },
    extraAmountPerHead: {
        type: Number,
        default: 0,
        min: 0
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: true
    },
    overview: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
    },
    rules: {
        type: [String],
        default: []
    },
    bannerImage: {
        type: String,
    },
    conveners: {
        type: [ConvenerSchema],
        default: []
    },
    facultyCoordinator: {
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
        },
    },
    facultyCoordinators: {
        type: [FacultyCoordinatorSchema],
        default: []
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Events', EventsSchema);
