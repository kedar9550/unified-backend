const fs = require("fs");
const path = require("path");

const Ticket = require("./ticket.model");
const Comment = require("./comment.model");
const Activity = require("./activity.model");
const ServiceMember = require("./serviceMember.model");
const Service = require("./service.model");
const { hasTicketAccess } = require("./ticket.access");
const NotificationService = require("../notification/notification.service");
const socketConfig = require("../../config/socket");

const MODULE = "ServiceDesk";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Physically deletes every attachment file (+ its ticket folder if now
// empty) from disk. Called only when a ticket reaches a TERMINAL state
// (CLOSED after feedback, or REJECTED by admin) — matches the original
// requirement: "once the ticket is closed, attachments are removed from
// the backend folder too".
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

// Wipes the chat (Comment collection) for a ticket.
const purgeTicketChat = async (ticketId) => {
  await Comment.deleteMany({ ticket: ticketId });
};

// Called when a ticket becomes CLOSED or REJECTED (terminal states) —
// removes attachments from disk + wipes chat history, exactly as the
// original app did.
const purgeTicketData = async (ticket) => {
  deleteTicketAttachments(ticket);
  ticket.isChatActive = false;
  await purgeTicketChat(ticket._id);
};

// Recalculates the ticket-level `status` from the per-employee rows in
// assignedTo[]. Only called after an emp updates their own row — admin
// rejection (whole ticket) and feedback-close are handled separately.
const recalculateTicketStatus = (ticket) => {
  if (!ticket.assignedTo || ticket.assignedTo.length === 0) {
    ticket.status = "OPEN";
    return;
  }

  const statuses = ticket.assignedTo.map(a => a.status);

  if (statuses.every(s => s === "REJECTED")) {
    // every single emp rejected their part — falls back to OPEN so the
    // Service Admin can re-assign someone else (ticket itself is NOT
    // auto-rejected; only an explicit admin action rejects the ticket).
    ticket.status = "OPEN";
  } else if (statuses.filter(s => s !== "REJECTED").every(s => s === "RESOLVED")) {
    // everyone who didn't reject has resolved their part
    ticket.status = "RESOLVED";
  } else if (statuses.some(s => s === "IN_PROGRESS" || s === "RESOLVED")) {
    ticket.status = "IN_PROGRESS";
  } else {
    ticket.status = "ASSIGNED";
  }
};

const notifyServiceAdmins = async (serviceId, { excludeEmployeeId, ...notif }) => {
  const admins = await ServiceMember.find({ service: serviceId, roleType: "SERVICE_ADMIN", isActive: true }).lean();
  for (const admin of admins) {
    if (excludeEmployeeId && admin.employee.toString() === excludeEmployeeId.toString()) continue;
    await NotificationService.sendNotification({ recipientId: admin.employee, module: MODULE, ...notif });
  }
};

// ---------------------------------------------------------------------
// Create + view
// ---------------------------------------------------------------------

// @desc   Raise a new ticket
// @route  POST /api/service-desk/tickets   (multipart/form-data)
// @access Any employee
exports.createTicket = async (req, res, next) => {
  try {
    const { title, description, service, priority } = req.body;

    if (!title || !description || !service) {
      res.status(400);
      return next(new Error("title, description and service are required"));
    }

    const serviceDoc = await Service.findById(service);
    if (!serviceDoc || !serviceDoc.isActive) {
      res.status(404);
      return next(new Error("Selected service is not available"));
    }

    const attachments = (req.files || []).map(file => ({
      fileName: file.originalname,
      storedName: file.filename,
      filePath: file.path,
      fileType: file.mimetype,
      uploadedBy: req.user.userId
    }));

    const ticket = await Ticket.create({
      ticketNumber: req.ticketNumber,
      title,
      description,
      service,
      priority: priority || "MEDIUM",
      createdBy: req.user.userId,
      attachments
    });

    await Activity.create({
      ticket: ticket._id,
      action: "TICKET_CREATED",
      performedBy: req.user.userId
    });

    await notifyServiceAdmins(service, {
      type: "ACTION_REQUIRED",
      title: "New Ticket Raised",
      message: `Ticket ${ticket.ticketNumber} — "${title}" needs to be assigned.`,
      link: `/service-desk/ticket/${ticket._id}`,
      metadata: { ticketId: ticket._id, serviceId: service }
    });

    res.status(201).json({ success: true, message: "Ticket created successfully", data: ticket });
  } catch (error) {
    next(error);
  }
};

// @desc   Tickets raised by the logged-in employee
// @route  GET /api/service-desk/tickets/my
exports.getMyTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.find({ createdBy: req.user.userId })
      .populate("service", "name")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: tickets });
  } catch (error) {
    next(error);
  }
};

// @desc   Tickets currently assigned to the logged-in employee (as SERVICE_EMP)
// @route  GET /api/service-desk/tickets/assigned-to-me
exports.getAssignedTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.find({ "assignedTo.employee": req.user.userId })
      .populate("service", "name")
      .populate("createdBy", "name institutionId email")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: tickets });
  } catch (error) {
    next(error);
  }
};

// @desc   All tickets for a service the logged-in employee administers
// @route  GET /api/service-desk/tickets/service/:serviceId
// @access SERVICE_ADMIN of that service (or PRIME)
exports.getServiceTickets = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");

    if (!isPrime) {
      const isAdmin = await ServiceMember.exists({
        service: serviceId, employee: req.user.userId, roleType: "SERVICE_ADMIN", isActive: true
      });
      if (!isAdmin) {
        res.status(403);
        return next(new Error("You are not a Service Admin for this service"));
      }
    }

    const filter = { service: serviceId };
    if (req.query.status) filter.status = req.query.status;

    const tickets = await Ticket.find(filter)
      .populate("createdBy", "name institutionId email")
      .populate("assignedTo.employee", "name institutionId email")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: tickets });
  } catch (error) {
    next(error);
  }
};

// @desc   Single ticket detail (with access check)
// @route  GET /api/service-desk/tickets/:id
exports.getTicketById = async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate("service", "name")
      .populate("createdBy", "name institutionId email profileImage")
      .populate("assignedTo.employee", "name institutionId email profileImage")
      .populate("assignedTo.assignedBy", "name")
      .lean();

    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    const allowed = await hasTicketAccess(req, ticket);
    if (!allowed) {
      res.status(403);
      return next(new Error("Access denied"));
    }

    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------
// Assignment (Service Admin)
// ---------------------------------------------------------------------

// @desc   Assign a ticket to one or more Service Emps
// @route  POST /api/service-desk/tickets/:id/assign
// @access SERVICE_ADMIN of the ticket's service
exports.assignTicket = async (req, res, next) => {
  try {
    const { employeeIds, priority } = req.body;

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      res.status(400);
      return next(new Error("Select at least one employee"));
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    if (ticket.status === "CLOSED" || ticket.status === "REJECTED") {
      res.status(400);
      return next(new Error(`Ticket is ${ticket.status} and cannot be re-assigned`));
    }

    // Validate every employeeId is actually a SERVICE_EMP for this service
    const validMembers = await ServiceMember.find({
      service: ticket.service,
      employee: { $in: employeeIds },
      roleType: "SERVICE_EMP",
      isActive: true
    }).lean();

    if (validMembers.length !== employeeIds.length) {
      res.status(400);
      return next(new Error("One or more selected employees are not Service Emps for this service"));
    }

    if (priority) ticket.priority = priority;

    // Merge: keep existing rows for employees already assigned (don't
    // reset their progress), add fresh rows for newly added employees.
    const existingIds = ticket.assignedTo.map(a => a.employee.toString());
    const newRows = employeeIds
      .filter(id => !existingIds.includes(id.toString()))
      .map(id => ({
        employee: id,
        assignedBy: req.user.userId,
        status: "ASSIGNED"
      }));

    ticket.assignedTo.push(...newRows);
    recalculateTicketStatus(ticket);
    await ticket.save();

    await Activity.create({
      ticket: ticket._id,
      action: "TICKET_ASSIGNED",
      performedBy: req.user.userId,
      metadata: { employeeIds: newRows.map(r => r.employee) }
    });

    for (const row of newRows) {
      await NotificationService.sendNotification({
        recipientId: row.employee,
        senderId: req.user.userId,
        module: MODULE,
        type: "ACTION_REQUIRED",
        title: "Ticket Assigned to You",
        message: `Ticket ${ticket.ticketNumber} — "${ticket.title}" has been assigned to you.`,
        link: `/service-desk/ticket/${ticket._id}`,
        metadata: { ticketId: ticket._id }
      });
    }

    res.json({ success: true, message: "Ticket assigned successfully", data: ticket });
  } catch (error) {
    next(error);
  }
};

// @desc   Admin rejects the whole ticket outright (before/instead of assigning)
// @route  POST /api/service-desk/tickets/:id/reject
// @access SERVICE_ADMIN of the ticket's service
exports.adminRejectTicket = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    ticket.status = "REJECTED";
    ticket.rejectionReason = reason || "";
    ticket.assignedTo = [];
    await purgeTicketData(ticket); // terminal state -> cleanup attachments + chat
    await ticket.save();

    await Activity.create({
      ticket: ticket._id,
      action: "TICKET_REJECTED",
      performedBy: req.user.userId,
      metadata: { reason: reason || "" }
    });

    await NotificationService.sendNotification({
      recipientId: ticket.createdBy,
      senderId: req.user.userId,
      module: MODULE,
      type: "REJECTED",
      title: "Ticket Rejected",
      message: `Ticket ${ticket.ticketNumber} was rejected. ${reason ? "Reason: " + reason : ""}`,
      link: `/service-desk/ticket/${ticket._id}`,
      metadata: { ticketId: ticket._id }
    });

    res.json({ success: true, message: "Ticket rejected", data: ticket });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------
// Status update (Service Emp)
// ---------------------------------------------------------------------

// @desc   Emp updates their own row's status (IN_PROGRESS / RESOLVED / REJECTED)
// @route  PUT /api/service-desk/tickets/:id/my-status
// @access The assigned SERVICE_EMP (their own row only)
exports.updateAssignmentStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const userId = req.user.userId;

    if (!["IN_PROGRESS", "RESOLVED", "REJECTED"].includes(status)) {
      res.status(400);
      return next(new Error("Invalid status. Allowed: IN_PROGRESS, RESOLVED, REJECTED"));
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    const row = ticket.assignedTo.find(a => a.employee.toString() === userId.toString());
    if (!row) {
      res.status(403);
      return next(new Error("You are not assigned to this ticket"));
    }

    if (["RESOLVED", "REJECTED"].includes(row.status)) {
      res.status(400);
      return next(new Error("Cannot change status once it is marked as resolved or rejected"));
    }

    row.status = status;
    row.note = note || "";
    row.updatedAt = new Date();

    recalculateTicketStatus(ticket);
    await ticket.save();

    await Activity.create({
      ticket: ticket._id,
      action: "STATUS_UPDATED",
      performedBy: userId,
      metadata: { status, note: note || "" }
    });

    // Notify ticket creator
    await NotificationService.sendNotification({
      recipientId: ticket.createdBy,
      senderId: userId,
      module: MODULE,
      type: ticket.status === "RESOLVED" ? "SUCCESS" : "INFO",
      title: "Ticket Status Updated",
      message: `Ticket ${ticket.ticketNumber} is now ${ticket.status}.`,
      link: `/service-desk/ticket/${ticket._id}`,
      metadata: { ticketId: ticket._id }
    });

    if (ticket.status === "RESOLVED") {
      await NotificationService.sendNotification({
        recipientId: ticket.createdBy,
        module: MODULE,
        type: "ACTION_REQUIRED",
        title: "Feedback Requested",
        message: `Please share your feedback for Ticket ${ticket.ticketNumber}.`,
        link: `/service-desk/ticket/${ticket._id}/feedback`,
        metadata: { ticketId: ticket._id }
      });
    }

    // Notify the Service Admin(s), except the emp who just updated
    await notifyServiceAdmins(ticket.service, {
      excludeEmployeeId: userId,
      senderId: userId,
      type: status === "REJECTED" ? "WARNING" : "INFO",
      title: "Ticket Status Updated",
      message: `Ticket ${ticket.ticketNumber} — an assignee marked their part as ${status}.`,
      link: `/service-desk/ticket/${ticket._id}`,
      metadata: { ticketId: ticket._id }
    });

    res.json({ success: true, message: "Status updated", data: ticket });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------

// @desc   Post a chat message on a ticket
// @route  POST /api/service-desk/tickets/:id/comments
exports.addComment = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400);
      return next(new Error("Message is required"));
    }

    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    if (!ticket.isChatActive) {
      res.status(400);
      return next(new Error("Chat is closed for this ticket"));
    }

    const allowed = await hasTicketAccess(req, ticket);
    if (!allowed) {
      res.status(403);
      return next(new Error("Access denied"));
    }

    const comment = await Comment.create({
      ticket: ticket._id,
      sender: req.user.userId,
      message
    });

    const populated = await Comment.findById(comment._id)
      .populate("sender", "name institutionId email profileImage")
      .lean();

    // Real-time push to everyone currently viewing the ticket room
    try {
      const io = socketConfig.getIO();
      io.to(`service-desk-ticket-${ticket._id}`).emit("new_message", populated);
    } catch (err) {
      console.error("Socket emit failed (chat still saved):", err.message);
    }

    // Notify participants who are NOT currently the sender
    const participantIds = new Set([ticket.createdBy.toString()]);
    (ticket.assignedTo || []).forEach(a => participantIds.add(a.employee.toString()));
    const admins = await ServiceMember.find({ service: ticket.service, roleType: "SERVICE_ADMIN", isActive: true }).lean();
    admins.forEach(a => participantIds.add(a.employee.toString()));
    participantIds.delete(req.user.userId.toString());

    for (const recipientId of participantIds) {
      await NotificationService.sendNotification({
        recipientId,
        senderId: req.user.userId,
        module: MODULE,
        type: "INFO",
        title: "New Message",
        message: `New message on Ticket ${ticket.ticketNumber}`,
        link: `/service-desk/ticket/${ticket._id}`,
        metadata: { ticketId: ticket._id }
      });
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// @desc   Fetch chat history for a ticket
// @route  GET /api/service-desk/tickets/:id/comments
exports.getComments = async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    const allowed = await hasTicketAccess(req, ticket);
    if (!allowed) {
      res.status(403);
      return next(new Error("Access denied"));
    }

    const comments = await Comment.find({ ticket: ticket._id })
      .populate("sender", "name institutionId email profileImage")
      .sort({ createdAt: 1 })
      .lean();

    res.json({ success: true, data: comments });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------

// @desc   Download a single attachment
// @route  GET /api/service-desk/tickets/:ticketId/attachments/:fileId
exports.downloadAttachment = async (req, res, next) => {
  try {
    const { ticketId, fileId } = req.params;
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    const allowed = await hasTicketAccess(req, ticket);
    if (!allowed) {
      res.status(403);
      return next(new Error("Access denied"));
    }

    const file = ticket.attachments.id(fileId);
    if (!file) {
      res.status(404);
      return next(new Error("File not found"));
    }

    res.download(file.filePath, file.fileName);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------
// Feedback + Close (used by feedback.controller.js)
// ---------------------------------------------------------------------

// Called by feedback.controller.js right after a Feedback doc is created.
// Marks the ticket CLOSED and purges attachments + chat (terminal state).
exports.closeTicketAfterFeedback = async (ticket) => {
  ticket.status = "CLOSED";
  ticket.closedAt = new Date();
  await purgeTicketData(ticket);
  await ticket.save();

  await Activity.create({
    ticket: ticket._id,
    action: "TICKET_CLOSED",
    performedBy: ticket.createdBy,
    metadata: {}
  });
};
