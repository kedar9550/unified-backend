const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const Ticket = require("./ticket.model");
const Service = require("./service.model");
const ServiceModuleBlock = require("./serviceModuleBlock.model");
const ServiceMember = require("./serviceMember.model");
const Comment = require("./comment.model");
const Activity = require("./activity.model");
const Feedback = require("./feedback.model");
const ServiceDeskStudent = require("./serviceDeskStudent.model");
const NotificationService = require("../notification/notification.service");
const socketConfig = require("../../config/socket");

const MODULE = "ServiceDesk";

// SLA definitions (in hours)
const SLA_HOURS = {
  CRITICAL: 2,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72
};

const calculateDueDate = (priority, fromDate = new Date()) => {
  const hours = SLA_HOURS[priority?.toUpperCase()] || 24;
  return new Date(fromDate.getTime() + hours * 60 * 60 * 1000);
};

// Physically deletes every attachment file (+ its ticket folder if now empty)
const deleteTicketAttachments = (ticket) => {
  if (!ticket.attachments || ticket.attachments.length === 0) return;

  ticket.attachments.forEach(file => {
    try {
      if (file.filePath && fs.existsSync(file.filePath)) {
        fs.unlinkSync(file.filePath);
      }
    } catch (err) {
      console.error("Error deleting attachment:", err.message);
    }
  });

  try {
    const dir = path.dirname(ticket.attachments[0].filePath);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
    }
  } catch (err) {
    console.error("Error deleting ticket attachment folder:", err.message);
  }

  ticket.attachments = [];
};

// Notify Admins
const notifyAdmins = async (serviceId, blockId, notif) => {
  let filter = { service: serviceId, roleType: "SERVICE_ADMIN", isActive: true };

  if (blockId) {
    const blockAdmins = await ServiceMember.find({
      service: serviceId,
      roleType: "SERVICE_ADMIN",
      isActive: true,
      blocks: blockId
    }).lean();

    if (blockAdmins.length > 0) {
      filter = { _id: { $in: blockAdmins.map(a => a._id) } };
    }
  }

  const admins = await ServiceMember.find(filter).lean();
  for (const admin of admins) {
    const modifiedNotif = {
      ...notif,
      metadata: {
        ...(notif.metadata || {}),
        targetRole: "SERVICE_ADMIN"
      }
    };
    await NotificationService.sendNotification({
      recipientId: admin.employee,
      module: MODULE,
      ...modifiedNotif
    });
  }
};

/**
 * Middleware: Verify Student JWT
 */
exports.verifyStudentAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided. Please log in with Roll No and OTP."
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "ganesha_varahidevi_m_kedars");
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        message: "Session expired or invalid token. Please log in again."
      });
    }

    if (!decoded.rollno) {
      return res.status(401).json({
        success: false,
        message: "Invalid student token payload."
      });
    }

    const student = await ServiceDeskStudent.findOne({
      rollno: decoded.rollno,
      isActive: true
    });

    if (!student) {
      return res.status(403).json({
        success: false,
        message: "Student account not found or access deactivated."
      });
    }

    req.student = student;
    next();
  } catch (error) {
    console.error("[Student Auth Middleware] Error:", error);
    return res.status(500).json({ success: false, message: "Authentication failure" });
  }
};

/**
 * @desc   Get Available Services & Blocks for Student Portal
 * @route  GET /api/campus-service-request/services-and-blocks
 * @access Student Auth Required
 */
exports.getPublicServicesAndBlocks = async (req, res, next) => {
  try {
    const services = await Service.find({ isActive: true })
      .select("name description isGlobalService applicableBlockType directEmployeeInvolvement subcategories")
      .sort({ name: 1 })
      .lean();

    const blocks = await ServiceModuleBlock.find({ isActive: true })
      .select("blockName blockCode blockType genderTag")
      .sort({ blockName: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        services,
        blocks
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Raise a New Student Ticket
 * @route  POST /api/campus-service-request/tickets
 * @access Student Auth Required (multipart/form-data)
 */
exports.createStudentTicket = async (req, res, next) => {
  try {
    const student = req.student;
    const { title, subcategory, customSubcategory, description, service, priority, block } = req.body;

    const effectiveSubcategory = (subcategory || "").trim();
    const effectiveCustom = (customSubcategory || "").trim();

    let computedTitle = (title || "").trim();
    if (effectiveSubcategory) {
      if (effectiveSubcategory === "Others") {
        computedTitle = effectiveCustom || "Other Issue";
      } else {
        computedTitle = effectiveSubcategory;
      }
    }

    if (!computedTitle) {
      computedTitle = "Campus Service Request";
    }

    if (!description || !service) {
      return res.status(400).json({
        success: false,
        message: "Service Category and problem description are required"
      });
    }

    const serviceDoc = await Service.findById(service);
    if (!serviceDoc || !serviceDoc.isActive) {
      return res.status(404).json({
        success: false,
        message: "Selected service is currently not available"
      });
    }

    if (!serviceDoc.isGlobalService && !block) {
      return res.status(400).json({
        success: false,
        message: "Please select your location / hostel / academic block"
      });
    }

    const normalizedPriority = (priority || "MEDIUM").toUpperCase();
    if (!SLA_HOURS[normalizedPriority]) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority selection"
      });
    }

    const dueDate = calculateDueDate(normalizedPriority, new Date());

    const attachments = (req.files || []).map(file => ({
      fileName: file.originalname,
      storedName: file.filename,
      filePath: file.path,
      fileType: file.mimetype
    }));

    const ticketNumber = req.ticketNumber || `TKT-${Math.floor(100000 + Math.random() * 900000)}`;

    const ticket = await Ticket.create({
      ticketNumber,
      title: computedTitle,
      subcategory: effectiveSubcategory,
      customSubcategory: effectiveCustom,
      description,
      service,
      block: block || null,
      creatorType: "STUDENT",
      createdBy: null,
      student: student._id,
      studentDetails: {
        rollno: student.rollno,
        studentname: student.studentname,
        coursename: student.coursename,
        branch: student.branch,
        mobilenumber: student.mobilenumber,
        gender: student.gender
      },
      priority: normalizedPriority,
      dueDate,
      attachments,
      status: "OPEN"
    });

    // Log Activity
    await Activity.create({
      ticket: ticket._id,
      action: "TICKET_CREATED",
      performerType: "STUDENT",
      performedBy: null,
      performedByStudent: student._id,
      performerName: `${student.studentname} (${student.rollno})`,
      metadata: {
        source: "CAMPUS_STUDENT_PORTAL",
        priority: normalizedPriority,
        service: serviceDoc.name
      }
    });

    // Notify Service Admins
    try {
      await notifyAdmins(service, block, {
        title: `New Student Ticket [${ticketNumber}]`,
        body: `Student ${student.studentname} (${student.rollno}) raised a ticket for ${serviceDoc.name}: "${computedTitle}"`,
        ticketId: ticket._id,
        link: `/service-desk/ticket/${ticket._id}`
      });
    } catch (notifErr) {
      console.error("[Student Ticket] Failed to dispatch admin notifications:", notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: "Your service request has been submitted successfully!",
      data: ticket
    });

  } catch (error) {
    console.error("[Student Ticket] Error in createStudentTicket:", error);
    next(error);
  }
};

/**
 * @desc   Get All Tickets Raised by Current Student
 * @route  GET /api/campus-service-request/my-tickets
 * @access Student Auth Required
 */
exports.getMyStudentTickets = async (req, res, next) => {
  try {
    const student = req.student;

    const tickets = await Ticket.find({
      $or: [
        { student: student._id },
        { "studentDetails.rollno": student.rollno }
      ]
    })
      .populate("service", "name isGlobalService applicableBlockType")
      .populate("block", "blockName blockCode blockType genderTag")
      .populate("assignedTo.employee", "name phone email")
      .sort({ createdAt: -1 })
      .lean();

    // Check feedback status for resolved/closed tickets
    const ticketIds = tickets.map(t => t._id);
    const feedbacks = await Feedback.find({ ticket: { $in: ticketIds } }).lean();
    const feedbackMap = {};
    feedbacks.forEach(fb => {
      feedbackMap[fb.ticket.toString()] = fb;
    });

    const ticketsWithFeedback = tickets.map(t => ({
      ...t,
      feedback: feedbackMap[t._id.toString()] || null
    }));

    return res.status(200).json({
      success: true,
      data: ticketsWithFeedback
    });

  } catch (error) {
    console.error("[Student Tickets] Error fetching tickets:", error);
    next(error);
  }
};

/**
 * @desc   Get Detailed Ticket View & Timeline for Student
 * @route  GET /api/campus-service-request/tickets/:id
 * @access Student Auth Required
 */
exports.getStudentTicketDetail = async (req, res, next) => {
  try {
    const student = req.student;
    const { id } = req.params;

    let query = { _id: id };
    // If param is ticketNumber
    if (id.startsWith("TKT-") || id.startsWith("SR-")) {
      query = { ticketNumber: id };
    }

    const ticket = await Ticket.findOne(query)
      .populate("service", "name description isGlobalService")
      .populate("block", "blockName blockCode blockType genderTag")
      .populate("assignedTo.employee", "name phone email")
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    // Ensure student owns this ticket
    const isOwner = (
      (ticket.student && ticket.student.toString() === student._id.toString()) ||
      (ticket.studentDetails && ticket.studentDetails.rollno === student.rollno)
    );

    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Access denied to this ticket" });
    }

    // Fetch Feedback if exists
    const feedback = await Feedback.findOne({ ticket: ticket._id }).lean();

    // Fetch Comments
    const comments = await Comment.find({ ticket: ticket._id })
      .populate("sender", "name")
      .populate("senderStudent", "studentname rollno")
      .sort({ createdAt: 1 })
      .lean();

    // Fetch Activities / Timeline
    const activities = await Activity.find({ ticket: ticket._id })
      .populate("performedBy", "name")
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        ticket,
        feedback,
        comments,
        activities
      }
    });

  } catch (error) {
    console.error("[Student Ticket Detail] Error:", error);
    next(error);
  }
};

/**
 * @desc   Submit Feedback and Close Ticket
 * @route  POST /api/campus-service-request/tickets/:id/feedback
 * @access Student Auth Required
 */
exports.submitStudentFeedback = async (req, res, next) => {
  try {
    const student = req.student;
    const { id } = req.params;
    const { rating, satisfaction, comments } = req.body;

    if (!rating || !satisfaction) {
      return res.status(400).json({
        success: false,
        message: "Rating (1-5) and Satisfaction level are required"
      });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    const isOwner = (
      (ticket.student && ticket.student.toString() === student._id.toString()) ||
      (ticket.studentDetails && ticket.studentDetails.rollno === student.rollno)
    );

    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Access denied to this ticket" });
    }

    if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
      return res.status(400).json({
        success: false,
        message: "Feedback can only be provided after the service request is resolved."
      });
    }

    // Check if feedback already submitted
    const existingFeedback = await Feedback.findOne({ ticket: ticket._id });
    if (existingFeedback) {
      return res.status(400).json({
        success: false,
        message: "Feedback has already been submitted for this request."
      });
    }

    const feedbackDoc = await Feedback.create({
      ticket: ticket._id,
      submittedByType: "STUDENT",
      submittedBy: null,
      submittedByStudent: student._id,
      studentRollNo: student.rollno,
      rating: Number(rating),
      satisfaction,
      comments: (comments || "").trim()
    });

    // Close Ticket and clean up attachments per policy
    ticket.status = "CLOSED";
    ticket.closedAt = new Date();
    ticket.isChatActive = false;
    deleteTicketAttachments(ticket);
    await ticket.save();

    // Log Activity
    await Activity.create({
      ticket: ticket._id,
      action: "TICKET_CLOSED",
      performerType: "STUDENT",
      performedBy: null,
      performedByStudent: student._id,
      performerName: `${student.studentname} (${student.rollno})`,
      metadata: {
        rating,
        satisfaction,
        feedbackId: feedbackDoc._id
      }
    });

    return res.status(200).json({
      success: true,
      message: "Thank you! Your feedback has been recorded and ticket is now closed.",
      data: feedbackDoc
    });

  } catch (error) {
    console.error("[Student Feedback] Error:", error);
    next(error);
  }
};

/**
 * @desc   Get Comments for a Ticket
 * @route  GET /api/campus-service-request/tickets/:id/comments
 * @access Student Auth Required
 */
exports.getStudentComments = async (req, res, next) => {
  try {
    const student = req.student;
    const { id } = req.params;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    const isOwner = (
      (ticket.student && ticket.student.toString() === student._id.toString()) ||
      (ticket.studentDetails && ticket.studentDetails.rollno === student.rollno)
    );

    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const comments = await Comment.find({ ticket: ticket._id })
      .populate("sender", "name")
      .populate("senderStudent", "studentname rollno")
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: comments
    });
  } catch (error) {
    console.error("[Get Student Comments] Error:", error);
    next(error);
  }
};

/**
 * @desc   Add Comment to Ticket Chat
 * @route  POST /api/campus-service-request/tickets/:id/comments
 * @access Student Auth Required
 */
exports.addStudentComment = async (req, res, next) => {
  try {
    const student = req.student;
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    if (!ticket.isChatActive || ticket.status === "CLOSED" || ticket.status === "REJECTED") {
      return res.status(400).json({
        success: false,
        message: "Chat is disabled for closed or rejected tickets."
      });
    }

    const isOwner = (
      (ticket.student && ticket.student.toString() === student._id.toString()) ||
      (ticket.studentDetails && ticket.studentDetails.rollno === student.rollno)
    );

    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const comment = await Comment.create({
      ticket: ticket._id,
      senderType: "STUDENT",
      sender: null,
      senderStudent: student._id,
      senderName: `${student.studentname} (${student.rollno})`,
      message: message.trim()
    });

    const populated = await Comment.findById(comment._id)
      .populate("senderStudent", "studentname rollno mobilenumber")
      .lean();

    // Real-time push to everyone viewing the ticket room
    try {
      const io = socketConfig.getIO();
      io.to(`service-desk-ticket-${ticket._id}`).emit("new_message", populated || comment);
    } catch (socketErr) {
      console.error("[Student Comment] Socket emit error:", socketErr.message);
    }

    // Notify assigned staff & service admins
    try {
      const recipientMap = new Map();

      if (ticket.assignedTo && ticket.assignedTo.length > 0) {
        for (const a of ticket.assignedTo) {
          if (a.employee && a.status !== "REJECTED") {
            recipientMap.set(a.employee.toString(), "SERVICE_EMP");
          }
        }
      }

      // If no active assignees, notify Service Admins
      if (recipientMap.size === 0 && ticket.service) {
        const admins = await ServiceMember.find({ service: ticket.service, roleType: "SERVICE_ADMIN", isActive: true }).lean();
        for (const admin of admins) {
          if (admin.employee) {
            recipientMap.set(admin.employee.toString(), "SERVICE_ADMIN");
          }
        }
      }

      for (const [recipientId, targetRole] of recipientMap.entries()) {
        await NotificationService.sendNotification({
          recipientId,
          module: MODULE,
          type: "INFO",
          title: `Student Message on [${ticket.ticketNumber}]`,
          message: `${student.studentname}: ${message.trim().substring(0, 100)}`,
          link: `/service-desk/ticket/${ticket._id}`,
          metadata: {
            ticketId: ticket._id,
            targetRole
          }
        });
      }
    } catch (notifErr) {
      console.error("[Student Comment] Notification error:", notifErr.message);
    }

    return res.status(201).json({
      success: true,
      data: populated || comment
    });

  } catch (error) {
    console.error("[Student Comment] Error:", error);
    next(error);
  }
};
