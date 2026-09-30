const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({

  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },

  title: {
    type: String,
    required: true,
    trim: true
  },

  subcategory: {
    type: String,
    trim: true,
    default: ""
  },

  customSubcategory: {
    type: String,
    trim: true,
    default: ""
  },

  description: {
    type: String,
    required: true
  },

  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Service",
    required: true
  },

  block: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceModuleBlock",
    default: null
  },

  // Creator identification
  creatorType: {
    type: String,
    enum: ["EMPLOYEE", "STUDENT"],
    default: "EMPLOYEE",
    required: true
  },

  creatorModel: {
    type: String,
    enum: ["Employee", "ServiceDeskStudent"],
    default: "Employee",
    required: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "creatorModel",
    required: true
  },

  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceDeskStudent",
    default: null
  },

  studentDetails: {
    rollno: { type: String, trim: true },
    studentname: { type: String, trim: true },
    coursename: { type: String, trim: true },
    branch: { type: String, trim: true },
    mobilenumber: { type: String, trim: true },
    gender: { type: String, trim: true }
  },

  // Admin can assign the SAME ticket to MULTIPLE Service Emps.
  // Each emp has their own independent status — one emp accepting/
  // rejecting/completing does not affect another emp's row.
  assignedTo: [{
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true
    },
    status: {
      type: String,
      enum: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"],
      default: "ASSIGNED"
    },
    note: {
      type: String,
      default: ""
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],

  attachments: [{
    fileName: String,      // original name shown to user
    storedName: String,    // actual name saved on disk
    filePath: String,      // full path on disk (used for cleanup on close)
    fileType: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee"
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  priority: {
    type: String,
    enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
    required: true
  },

  dueDate: {
    type: Date,
    default: null
  },

  // Ticket-level status is a DERIVED summary of the assignedTo[] rows
  // below (the controller recalculates this every time an emp's row
  // changes — it is not set directly by an emp action):
  //   OPEN         -> no emp assigned yet, waiting for Service Admin
  //   ASSIGNED     -> at least one emp assigned, all still "ASSIGNED" (none started)
  //   IN_PROGRESS  -> at least one emp is "IN_PROGRESS"
  //   RESOLVED     -> every non-rejected emp has "RESOLVED" (all assigned emps done)
  //   REJECTED     -> every assigned emp rejected (admin must re-assign someone new)
  //   CLOSED       -> user confirmed after RESOLVED; chat + attachments purged
  status: {
    type: String,
    enum: ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED", "CLOSED"],
    default: "OPEN"
  },

  rejectionReason: {
    type: String,
    default: ""
  },

  isChatActive: {
    type: Boolean,
    default: true // flipped to false once ticket is CLOSED and chat is purged
  },

  closedAt: {
    type: Date,
    default: null
  }

}, { timestamps: true });

ticketSchema.index({ service: 1, status: 1 });
ticketSchema.index({ createdBy: 1 });
ticketSchema.index({ student: 1 });
ticketSchema.index({ "studentDetails.rollno": 1 });
ticketSchema.index({ "assignedTo.employee": 1 });

const Ticket = mongoose.model("Ticket", ticketSchema);

// One-time non-blocking migration for legacy student tickets
setImmediate(async () => {
  try {
    const res = await Ticket.updateMany(
      { creatorType: "STUDENT", createdBy: null, student: { $ne: null } },
      [{ $set: { createdBy: "$student", creatorModel: "ServiceDeskStudent" } }]
    );
    if (res.modifiedCount > 0) {
      console.log(`[Ticket Migration] Backfilled createdBy for ${res.modifiedCount} student ticket(s).`);
    }
  } catch (err) {
    // Non-critical auto-migration
  }
});

module.exports = Ticket;
