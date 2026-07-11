const Ticket = require("./ticket.model");
const Feedback = require("./feedback.model");
const Activity = require("./activity.model");
const ServiceMember = require("./serviceMember.model");
const NotificationService = require("../notification/notification.service");
const { closeTicketAfterFeedback } = require("./ticket.controller");

const MODULE = "ServiceDesk";

// ---------------------------------------------------------------------
// Submit feedback (ticket creator only, ticket must be RESOLVED)
// ---------------------------------------------------------------------

// @desc   Submit feedback for a RESOLVED ticket — closes + purges the ticket
// @route  POST /api/service-desk/tickets/:id/feedback
// @access The ticket's creator only
exports.submitFeedback = async (req, res, next) => {
  try {
    const { rating, satisfaction, comments } = req.body;
    const userId = req.user.userId;

    if (!rating || !satisfaction) {
      res.status(400);
      return next(new Error("rating and satisfaction are required"));
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    if (ticket.createdBy.toString() !== userId.toString()) {
      res.status(403);
      return next(new Error("Only the ticket creator can submit feedback"));
    }

    if (ticket.status !== "RESOLVED") {
      res.status(400);
      return next(new Error("Feedback can only be submitted once the ticket is RESOLVED"));
    }

    const existing = await Feedback.findOne({ ticket: ticket._id });
    if (existing) {
      res.status(400);
      return next(new Error("Feedback has already been submitted for this ticket"));
    }

    const feedback = await Feedback.create({
      ticket: ticket._id,
      submittedBy: userId,
      rating,
      satisfaction,
      comments: comments || ""
    });

    await Activity.create({
      ticket: ticket._id,
      action: "FEEDBACK_SUBMITTED",
      performedBy: userId,
      metadata: { rating, satisfaction }
    });

    // Closes the ticket + purges attachments/chat (terminal state)
    await closeTicketAfterFeedback(ticket);

    // Notify the Service Admin(s) that the ticket is now closed
    const admins = await ServiceMember.find({
      service: ticket.service,
      roleType: "SERVICE_ADMIN",
      isActive: true
    }).lean();

    for (const admin of admins) {
      await NotificationService.sendNotification({
        recipientId: admin.employee,
        senderId: userId,
        module: MODULE,
        type: "INFO",
        title: "Ticket Closed",
        message: `Ticket ${ticket.ticketNumber} was closed after feedback was submitted.`,
        link: `/service-desk/ticket/${ticket._id}`,
        metadata: { ticketId: ticket._id, targetRole: "SERVICE_ADMIN" }
      });
    }

    res.status(201).json({ success: true, message: "Feedback submitted, ticket closed", data: feedback });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------
// Pending feedback (RESOLVED tickets by this employee with no feedback yet)
// ---------------------------------------------------------------------

// @desc   RESOLVED tickets raised by the logged-in employee that still need feedback
// @route  GET /api/service-desk/tickets/feedback/pending
// @access Any employee (their own tickets only)
exports.getPendingFeedback = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const resolvedTickets = await Ticket.find({ createdBy: userId, status: "RESOLVED" })
      .populate("service", "name")
      .sort({ updatedAt: -1 })
      .lean();

    if (resolvedTickets.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const ticketIds = resolvedTickets.map(t => t._id);
    const alreadyGiven = await Feedback.find({ ticket: { $in: ticketIds } }).distinct("ticket");
    const givenSet = new Set(alreadyGiven.map(id => id.toString()));

    const pending = resolvedTickets.filter(t => !givenSet.has(t._id.toString()));

    res.json({ success: true, data: pending });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------
// Feedback analytics (PRIME / Service Admin)
// ---------------------------------------------------------------------

// @desc   Feedback analytics — average rating, satisfaction distribution, trend
// @route  GET /api/service-desk/tickets/feedback/analytics
// @query  service (optional serviceId to scope to one service)
// @access PRIME (all services) or SERVICE_ADMIN (only their own service)
exports.getAllFeedback = async (req, res, next) => {
  try {
    const { service } = req.query;
    const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");

    // Build the set of ticket ids this caller is allowed to see feedback for
    let ticketFilter = {};

    if (service) {
      if (!isPrime) {
        const isAdmin = await ServiceMember.exists({
          service, employee: req.user.userId, roleType: "SERVICE_ADMIN", isActive: true
        });
        if (!isAdmin) {
          res.status(403);
          return next(new Error("You are not a Service Admin for this service"));
        }
      }
      ticketFilter.service = service;
    } else if (!isPrime) {
      // No service specified and not PRIME -> scope to services this employee administers
      const adminOf = await ServiceMember.find({
        employee: req.user.userId, roleType: "SERVICE_ADMIN", isActive: true
      }).distinct("service");

      if (adminOf.length === 0) {
        res.status(403);
        return next(new Error("You are not a Service Admin for any service"));
      }
      ticketFilter.service = { $in: adminOf };
    }

    const tickets = await Ticket.find(ticketFilter).distinct("_id");

    const feedbacks = await Feedback.find({ ticket: { $in: tickets } })
      .populate("submittedBy", "name institutionId email")
      .populate({ path: "ticket", select: "ticketNumber title service", populate: { path: "service", select: "name" } })
      .sort({ createdAt: -1 })
      .lean();

    const totalCount = feedbacks.length;
    const averageRating = totalCount === 0
      ? 0
      : Number((feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalCount).toFixed(2));

    const satisfactionDistribution = {
      "Very Satisfied": 0,
      "Satisfied": 0,
      "Neutral": 0,
      "Dissatisfied": 0,
      "Very Dissatisfied": 0
    };
    feedbacks.forEach(f => {
      satisfactionDistribution[f.satisfaction] = (satisfactionDistribution[f.satisfaction] || 0) + 1;
    });

    // Monthly trend — average rating + count per YYYY-MM bucket
    const trendMap = {};
    feedbacks.forEach(f => {
      const bucket = new Date(f.createdAt).toISOString().slice(0, 7); // "YYYY-MM"
      if (!trendMap[bucket]) trendMap[bucket] = { month: bucket, count: 0, ratingSum: 0 };
      trendMap[bucket].count += 1;
      trendMap[bucket].ratingSum += f.rating;
    });

    const trend = Object.values(trendMap)
      .map(b => ({
        month: b.month,
        count: b.count,
        averageRating: Number((b.ratingSum / b.count).toFixed(2))
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      success: true,
      data: {
        totalCount,
        averageRating,
        satisfactionDistribution,
        trend,
        feedbacks
      }
    });
  } catch (error) {
    next(error);
  }
};
