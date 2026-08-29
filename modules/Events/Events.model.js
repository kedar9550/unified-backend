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
    department: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EventDepartment'
    }],
    price: {
        type: Number,
        default: 0,
        min: 0
    },
    priceType: {
        type: String,
        enum: ['Per Head', 'Per Team'],
        default: 'Per Head'
    },
    maxTeamSize: {
        type: Number,
        required: true,
        min: 1
    },
    venueType: {
        type: String,
        enum: ['Indoor', 'Outdoor']
    },
    building: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Building',
    },
    floor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Floor',
    },
    ground: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ground',
    },
    roomNo: {
        type: String,
        trim: true,
        default: ''
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
    eventSchool: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EventSchools',
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
    themes: {
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
    studentCoordinators: {
        type: [{
            rollNo: { type: String, trim: true },
            name: { type: String, trim: true },
            department: { type: String, trim: true },
            branch: { type: String, trim: true }
        }],
        default: []
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Events', EventsSchema);
