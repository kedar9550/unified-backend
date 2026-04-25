import mongoose from "mongoose";

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
    programName: { type: String, required: true, },
    branch: { type: String, required: true },
    department: String,
    semester: String,
    joinedBatch: { type: Number, required: true },
    academicBatch: { type: Number, required: true },
    joinedYear: { type: String, required: true },
    relievedYear: { type: String, required: true },
    studentStatus: { type: String, enum: ["Regular", "Transfer", "Alumni", "Detained"] },
    entranceType: { type: String, enum: ["EAMCET", "I-CET", "Diploma", "Lateral Entry", "Management", "Other"] },
    seatType: { type: String, enum: ["foreign-nation", "Management", "Convener"], required: true },
    eamcetHallTicketNumber: String,
    eamcetRank: Number,
    scholarship: String
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

}, { timestamps: true });

export default mongoose.model("Student", studentSchema);