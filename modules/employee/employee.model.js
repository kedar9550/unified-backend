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
    qualification: {
        type: String,
        trim: true,
        default: ""
    },
    doctorate: {
        type: String,
        enum: ["yes", "no"],
        default: "no"
    },
    leadership: {
        type: String,
        enum: ["yes", "no"],
        default: "no"
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
        enum: ["Aditya University", "Aditya College of Pharmacy", ""],
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

    fcmIds: {
        type: [String],
        default: []
    },

}, { timestamps: true });

const isLeadershipDesignation = (designation) => {
    if (!designation) return false;
    const cleanDesig = designation.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const leadershipRoles = ['Deans', 'Associate Deans', 'CoE', 'HoD', 'Chancellor', 'Pro-chancellor', 'Registrar', 'Vice-chancellor', 'Director Academics', 'Head'];
    return leadershipRoles.some(role => {
        if (!role) return false;
        let cleanRole = role.toLowerCase().trim();
        if (cleanRole.endsWith('s') && !['coe', 'chancellor', 'pro-chancellor', 'vice-chancellor', 'registrar'].includes(cleanRole)) {
            cleanRole = cleanRole.slice(0, -1);
        }
        cleanRole = cleanRole.replace(/[^a-z0-9]/g, ' ');
        return cleanDesig.includes(cleanRole);
    });
};

function handleEmployeeUpdate(update) {
    if (!update) return;
    if (update.$set && update.$set.designation !== undefined) {
        update.$set.leadership = isLeadershipDesignation(update.$set.designation) ? "yes" : "no";
    } else if (update.designation !== undefined) {
        update.leadership = isLeadershipDesignation(update.designation) ? "yes" : "no";
    }
}

// hash password
EmployeeSchema.pre("save", async function () {
    if (this.isModified("designation") || this.isNew) {
        this.leadership = isLeadershipDesignation(this.designation) ? "yes" : "no";
    }

    if (this.isModified("qualification")) {
        const qual = (this.qualification || "").toUpperCase().trim();
        if (qual === "PHD") {
            this.doctorate = "yes";
        } else {
            this.doctorate = "no";
        }
    }

    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

EmployeeSchema.pre("updateOne", function () {
    handleEmployeeUpdate(this.getUpdate());
});

EmployeeSchema.pre("findOneAndUpdate", function () {
    handleEmployeeUpdate(this.getUpdate());
});

EmployeeSchema.pre("updateMany", function () {
    handleEmployeeUpdate(this.getUpdate());
});

// compare password
EmployeeSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Employee", EmployeeSchema);

