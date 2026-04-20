const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs"); // Fixed: bcryptjs

const UserSchema = new mongoose.Schema({

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
        type: String,
        required: true,
        trim: true
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

    userType: {
        type: String,
        enum: ["Student", "Employee"],
        default: "Employee"
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
    }

}, { timestamps: true });

// hash password
UserSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// compare password
UserSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password);
};

// Fixed: export using mongoose
module.exports = mongoose.model("User", UserSchema);
