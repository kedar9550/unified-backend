const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studentSchema = new mongoose.Schema({

  rollNo: { type: String, required: true, unique: true },

  personalInfo: {
    studentName: { type: String, required: true, },
    gender: String,
    dateOfBirth: String,
    bloodGroup: String,
    nationality: String,
    religion: String,
    motherTongue: String,
    category: String,
    casteName: String
  },

  academicInfo: {
    programName: { type: String },
    branch: { type: String },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    semester: Number,
    joinedBatch: { type: Number, required: true },
    academicBatch: { type: Number, required: true },
    joinedYear: { type: String, required: true },
    relievedYear: { type: String, required: true },
    studentStatus: { type: String, enum: ["Regular", "Transfer", "Alumni", "Detained"] },
    entranceType: { type: String },
    seatType: { type: String },
    eamcetHallTicketNumber: String,
    eamcetRank: Number,
    scholarship: String,
    backlogs: { type: Number, default: 0 },
    overallPercent: { type: Number, default: 0 },
    semesterResults: [{
      semester: Number,
      percentage: Number
    }]
  },

  contactInfo: {
    mobileNumber: { type: String, required: true },
    emailId: { type: String, required: true },
    address: {
      doorNo: String,
      street: String,
      village: String,
      mandal: String,
      district: String,
      stateName: String,
      country: String
    }
  },

  parentInfo: {
    fatherName: String,
    fatherOccupation: String,
    fatherMobileNumber: String,
    fatherEmailId: String,
    motherOccupation: String,
    motherMobileNumber: String,
    motherEmailId: String
  },

  education: {
    ssc: {
      hallTicket: String,
      board: String,
      yearOfPass: Number,
      maxMarks: Number,
      obtainedMarks: Number,
      institution: String,
      gradePoints: Number
    },
    intermediate: {
      hallTicket: String,
      board: String,
      yearOfPass: Number,
      maxMarks: Number,
      obtainedMarks: Number,
      institution: String,
      gradePoints: Number
    },
    diploma: {
      hallTicket: String,
      board: String,
      yearOfPass: Number,
      maxMarks: Number,
      obtainedMarks: Number,
      institution: String
    },
    degree: {
      hallTicket: String,
      board: String,
      yearOfPass: Number,
      maxMarks: Number,
      obtainedMarks: Number,
      institution: String
    }
  },

  system: {
    isActive: { type: Boolean, default: true },
    password: { type: String, required: true }
  }


}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});


studentSchema.virtual("assignmentStatus").get(function () {
  if (this.academicInfo?.department && this.academicInfo?.semester && this.academicInfo?.branch && this.academicInfo?.programName) {
    return "Assigned";
  }
  return "Unassigned";
});

// hash password
studentSchema.pre("save", async function () {
  if (!this.isModified("system.password")) return;
  const salt = await bcrypt.genSalt(10);
  this.system.password = await bcrypt.hash(this.system.password, salt);
});

// compare password
studentSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.system.password);
};

module.exports = mongoose.model("Student", studentSchema);