const fs = require("fs");
const path = require("path");

const Ticket = require("./ticket.model");
const Comment = require("./comment.model");
const Activity = require("./activity.model");
const ServiceMember = require("./serviceMember.model");
const Service = require("./service.model");
const Employee = require("../employee/employee.model");
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
// removes attachments from disk and disables new chat.
const purgeTicketData = async (ticket) => {
  deleteTicketAttachments(ticket);
  ticket.isChatActive = false;
  // Chat history is retained as per user request, only new chat is disabled
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
    // Service Admin can re-assign someone else. It stays in Active Tickets.
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
    
    // Inject targetRole so frontend can auto-switch roles when clicking the notification
    const modifiedNotif = {
      ...notif,
      metadata: {
        ...(notif.metadata || {}),
        targetRole: "SERVICE_ADMIN"
      }
    };
    
    await NotificationService.sendNotification({ recipientId: admin.employee, module: MODULE, ...modifiedNotif });
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

    const creator = await Employee.findById(req.user.userId).select("name").lean();

    await notifyServiceAdmins(service, {
      type: "ACTION_REQUIRED",
      title: "New Service Ticket Raised",
      message: `A new support ticket has been created by ${creator ? creator.name : "a user"} for the ${serviceDoc.name} service.\nTicket ID: ${ticket.ticketNumber}\nPlease review and assign the ticket to an appropriate service employee.`,
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
    const { tab } = req.query;
    const filter = {};
    
    if (tab === 'rejected') {
      filter.assignedTo = { $elemMatch: { employee: req.user.userId, status: "REJECTED" } };
    } else {
      filter.assignedTo = { $elemMatch: { employee: req.user.userId, status: { $ne: "REJECTED" } } };
    }

    const tickets = await Ticket.find(filter)
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

    if (req.query.tab === 'rejected') {
      filter.status = "REJECTED";
    } else if (req.query.tab === 'active') {
      filter.status = { $ne: "REJECTED" };
    }
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
    const { employeeIds, priority, dueDate } = req.body;

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
    if (dueDate) ticket.dueDate = dueDate;

    // Merge: keep existing rows for employees already assigned (don't
    // reset their progress), BUT if they had previously REJECTED it,
    // reset their status to ASSIGNED so they can work on it again.
    const newRows = [];
    const reassignedIds = [];

    for (const id of employeeIds) {
      const existingRow = ticket.assignedTo.find(a => a.employee.toString() === id.toString());
      if (existingRow) {
        if (existingRow.status === "REJECTED") {
          existingRow.status = "ASSIGNED";
          existingRow.assignedBy = req.user.userId;
          existingRow.note = "";
          existingRow.updatedAt = new Date();
          reassignedIds.push(id.toString());
        }
      } else {
        newRows.push({
          employee: id,
          assignedBy: req.user.userId,
          status: "ASSIGNED"
        });
      }
    }

    ticket.assignedTo.push(...newRows);
    recalculateTicketStatus(ticket);
    await ticket.save();

    const allNotifiedIds = [...newRows.map(r => r.employee.toString()), ...reassignedIds];

    if (allNotifiedIds.length > 0) {
      await Activity.create({
        ticket: ticket._id,
        action: "TICKET_ASSIGNED",
        performedBy: req.user.userId,
        metadata: { employeeIds: allNotifiedIds }
      });

      for (const empId of allNotifiedIds) {
        await NotificationService.sendNotification({
          recipientId: empId,
          senderId: req.user.userId,
          module: MODULE,
          type: "ACTION_REQUIRED",
          title: "New Ticket Assigned",
          message: `A new support ticket ${ticket.ticketNumber} has been assigned to you.\nPlease review the issue and begin processing it.`,
          link: `/service-desk/ticket/${ticket._id}`,
          metadata: { ticketId: ticket._id }
        });
      }

      // Notify the ticket creator about the assignment
      const assignedEmps = await Employee.find({ _id: { $in: allNotifiedIds } }).select("name").lean();
      const empNames = assignedEmps.map(e => e.name).join(", ");
      
      await NotificationService.sendNotification({
        recipientId: ticket.createdBy,
        senderId: req.user.userId,
        module: MODULE,
        type: "INFO",
        title: "Ticket Assigned",
        message: `Your ticket ${ticket.ticketNumber} has been assigned to a service representative and is now under progress.\nAssigned To: ${empNames}`,
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

    if (ticket.status === "RESOLVED") {
      ticket.isChatActive = false;
    }

    await ticket.save();

    await Activity.create({
      ticket: ticket._id,
      action: "STATUS_UPDATED",
      performedBy: userId,
      metadata: { status, note: note || "" }
    });

    const updater = await Employee.findById(userId).select("name").lean();
    const empName = updater ? updater.name : "an employee";

    if (ticket.status === "RESOLVED") {
      // 1. Notify User (Resolved)
      await NotificationService.sendNotification({
        recipientId: ticket.createdBy,
        senderId: userId,
        module: MODULE,
        type: "SUCCESS",
        title: "Ticket Resolved",
        message: `Your ticket ${ticket.ticketNumber} has been marked as Resolved.\nPlease verify the resolution and submit your feedback regarding the support experience.`,
        link: `/service-desk/ticket/${ticket._id}`,
        metadata: { ticketId: ticket._id }
      });
      
      // Feedback Requested specific link is skipped as it is now combined above or you can keep it separate.
      // The user workflow combines them into one message. We will keep just the one message as requested.

      // 2. Notify Service Admins (Resolved)
      await notifyServiceAdmins(ticket.service, {
        excludeEmployeeId: userId,
        senderId: userId,
        type: "SUCCESS",
        title: "Ticket Resolved",
        message: `Ticket ${ticket.ticketNumber} has been successfully resolved by ${empName}.\nThe ticket is awaiting user feedback.`,
        link: `/service-desk/ticket/${ticket._id}`,
        metadata: { ticketId: ticket._id }
      });
    } else {
      // 1. Notify User (Status Updated)
      await NotificationService.sendNotification({
        recipientId: ticket.createdBy,
        senderId: userId,
        module: MODULE,
        type: "INFO",
        title: "Ticket Status Updated",
        message: `The status of your ticket ${ticket.ticketNumber} has been updated to ${ticket.status}.${note ? '\nLatest Update:\n' + note : ''}`,
        link: `/service-desk/ticket/${ticket._id}`,
        metadata: { ticketId: ticket._id }
      });

      // 2. Notify Service Admins (Status Updated)
      await notifyServiceAdmins(ticket.service, {
        excludeEmployeeId: userId,
        senderId: userId,
        type: status === "REJECTED" ? "WARNING" : "INFO",
        title: "Ticket Status Updated",
        message: `Ticket ${ticket.ticketNumber} assigned to ${empName} has been updated.\nCurrent Status: ${ticket.status}`,
        link: `/service-desk/ticket/${ticket._id}`,
        metadata: { ticketId: ticket._id }
      });
    }

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
// Activities
// ---------------------------------------------------------------------

// @desc   Fetch activity timeline for a ticket
// @route  GET /api/service-desk/tickets/:id/activities
exports.getTicketActivities = async (req, res, next) => {
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

    const activities = await Activity.find({ ticket: ticket._id })
      .populate("performedBy", "name")
      .sort({ createdAt: 1 })
      .lean();

    res.json({ success: true, data: activities });
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

exports.getServiceDeskReports = async (req, res, next) => {
  try {
    const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");
    let allowedServiceIds = [];

    if (!isPrime) {
      const adminMemberships = await ServiceMember.find({
        employee: req.user.userId,
        roleType: "SERVICE_ADMIN",
        isActive: true
      }).lean();
      
      if (adminMemberships.length === 0) {
        res.status(403);
        return next(new Error("Not authorized to view any service desk reports"));
      }
      allowedServiceIds = adminMemberships.map(m => m.service.toString());
    }

    const { dateRange, startDate, endDate, serviceId, priority } = req.query;
    const filter = {};

    if (serviceId && serviceId !== "all") {
      if (!isPrime && !allowedServiceIds.includes(serviceId)) {
        res.status(403);
        return next(new Error("Not authorized to view reports for this service"));
      }
      filter.service = serviceId;
    } else if (!isPrime) {
      filter.service = { $in: allowedServiceIds };
    }

    if (priority && priority !== "all") {
      filter.priority = priority.toUpperCase();
    }

    if (dateRange && dateRange !== "all") {
      const now = new Date();
      let start = new Date();
      if (dateRange === "last10days") start.setDate(now.getDate() - 10);
      else if (dateRange === "last30days") start.setDate(now.getDate() - 30);
      else if (dateRange === "last3months") start.setMonth(now.getMonth() - 3);
      else if (dateRange === "last6months") start.setMonth(now.getMonth() - 6);
      else if (dateRange === "lastyear") start.setFullYear(now.getFullYear() - 1);
      else if (dateRange === "custom" && startDate) {
        start = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.createdAt = { $gte: start, $lte: end };
        } else {
          filter.createdAt = { $gte: start };
        }
      }
      
      if (dateRange !== "custom") {
        filter.createdAt = { $gte: start };
      }
    }

    const tickets = await Ticket.find(filter)
      .populate("assignedTo.employee", "name")
      .populate("service", "name")
      .lean();

    let total = tickets.length;
    let resolvedOrClosed = 0;
    let totalHandlingMs = 0;
    let overdueCount = 0;
    
    const statusCounts = {};
    const trendMap = {}; 
    
    tickets.forEach(t => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      
      if (t.status === "RESOLVED" || t.status === "CLOSED") {
        resolvedOrClosed++;
        if (t.closedAt || t.updatedAt) {
          totalHandlingMs += new Date(t.closedAt || t.updatedAt).getTime() - new Date(t.createdAt).getTime();
        }
      }

      if (t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "RESOLVED" && t.status !== "CLOSED") {
        overdueCount++;
      }

      const createdStr = new Date(t.createdAt).toISOString().split('T')[0];
      if (!trendMap[createdStr]) trendMap[createdStr] = { date: createdStr, created: 0, closed: 0 };
      trendMap[createdStr].created++;

      if (t.status === "RESOLVED" || t.status === "CLOSED") {
        const closedDate = t.closedAt || t.updatedAt;
        if (closedDate) {
          const closedStr = new Date(closedDate).toISOString().split('T')[0];
          if (!trendMap[closedStr]) trendMap[closedStr] = { date: closedStr, created: 0, closed: 0 };
          trendMap[closedStr].closed++;
        }
      }
    });

    const resolutionRate = total > 0 ? Math.round((resolvedOrClosed / total) * 100) + "%" : "0%";
    const avgMs = resolvedOrClosed > 0 ? (totalHandlingMs / resolvedOrClosed) : 0;
    const avgHandlingTime = avgMs > 0 ? (avgMs / (1000 * 60 * 60 * 24)).toFixed(1) + " Days" : "0 Days";

    const statusColors = {
      OPEN: "#f97316",       // Orange for Unassigned
      ASSIGNED: "#3b82f6",   // Blue for Assigned (replaced violet)
      IN_PROGRESS: "#f59e0b",// Amber for In Progress
      RESOLVED: "#22c55e",   // Green for Resolved
      REJECTED: "#ef4444",   // Red for Rejected
      CLOSED: "#64748b"      // Slate for Closed
    };

    const statusData = Object.keys(statusCounts).map(status => {
      let displayName = status.replace("_", " ");
      if (status === "OPEN") displayName = "UNASSIGNED";
      
      return {
        name: displayName,
        value: statusCounts[status],
        color: statusColors[status] || "#cbd5e1"
      };
    });

    const trendData = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

    const recentTickets = tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(t => ({
      _id: t._id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      dueDate: t.dueDate,
      assignedTo: t.assignedTo?.map(a => a.employee?.name).filter(Boolean).join(", ") || null
    }));

    res.json({
      summary: { resolutionRate, avgHandlingTime, overdueTickets: overdueCount },
      statusData,
      trendData,
      recentTickets
    });
  } catch (error) {
    next(error);
  }
};
