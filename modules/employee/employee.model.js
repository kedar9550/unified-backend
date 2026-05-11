const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs"); // Fixed: bcryptjs

const EmployeeSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 50
    },

    institutionId: {
        type: String,
        required: true,
        unique: true
    },

    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: true
    },
    coreDepartment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: true
    },
    designation: {
        type: String,
        trim: true,
        default: ""
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        validate: [validator.isEmail, "Invalid email"]
    },

    password: {
        type: String,
        required: true,
        minlength: 6
    },

    phone: {
        type: String,
        required: true,
        trim: true,
        validate: {
            validator: (v) => validator.isMobilePhone(v, 'any'),
            message: "Invalid phone number"
        }
    },


    scopusId: { type: String, default: "" },
    wosId: { type: String, default: "" },
    orcidId: { 
        type: String, 
        default: "",
        validate: {
            validator: function (v) {
                return !v || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(v);
            },
            message: "Invalid ORCID format"
        }
    },
    googleScholarId: { type: String, default: "" },
    panNumber: { 
        type: String, 
        uppercase: true, 
        trim: true, 
        default: "",
        validate: {
            validator: function (v) {
                return !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
            },
            message: "Invalid PAN format"
        }
    },
    college: { 
        type: String, 
        enum: ["Aditya University", "Aditya college of engineering and technology", "Aditya College of Pharmacy", ""],
        default: "" 
    },

    isActive: {
        type: Boolean,
        default: true
    },

    otp: String,
    otpExpiry: Date,

    profileImage: {
        type: String,
        default: null
    },

}, { timestamps: true });

// hash password
EmployeeSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// compare password
EmployeeSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Employee", EmployeeSchema);
