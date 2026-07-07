const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/authMiddleware");

const Ticket = require("./ticket.model");
const ServiceMember = require("./serviceMember.model");

const ticketNumberMiddleware = require("./ticketNumber.middleware");
const upload = require("./upload.middleware");

const {
  createTicket,
  getMyTickets,
  getAssignedTickets,
  getServiceTickets,
  getTicketById,
  assignTicket,
  adminRejectTicket,
  updateAssignmentStatus,
  addComment,
  getComments,
  downloadAttachment
} = require("./ticket.controller");

const {
  submitFeedback,
  getPendingFeedback,
  getAllFeedback
} = require("./feedback.controller");

// ---------------------------------------------------------------------
// Local guard — assignTicket / adminRejectTicket don't check the caller's
// permission themselves (unlike getServiceTickets, which already checks
// this inline), so it's enforced here instead of touching the
// already-built controller.
// ---------------------------------------------------------------------
const requireServiceAdminOfTicket = async (req, res, next) => {
  try {
    const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");
    if (isPrime) return next();

    const ticket = await Ticket.findById(req.params.id).select("service").lean();
    if (!ticket) {
      res.status(404);
      return next(new Error("Ticket not found"));
    }

    const isAdmin = await ServiceMember.exists({
      service: ticket.service,
      employee: req.user.userId,
      roleType: "SERVICE_ADMIN",
      isActive: true
    });

    if (!isAdmin) {
      res.status(403);
      return next(new Error("You are not a Service Admin for this ticket's service"));
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Every route below needs a logged-in user
router.use(protect);

// ---------------------------------------------------------------------
// Create + view (any employee) — static paths BEFORE /:id
// ---------------------------------------------------------------------

// multipart/form-data: ticketNumber generated first so upload.middleware
// can use it to build the storage folder, matching createTicket's
// req.ticketNumber + req.files expectations.
router.post("/", ticketNumberMiddleware, upload.array("attachments"), createTicket);

router.get("/my", getMyTickets);
router.get("/assigned-to-me", getAssignedTickets);

// Feedback list endpoints — must come before GET /:id
router.get("/feedback/pending", getPendingFeedback);
router.get("/feedback/analytics", getAllFeedback);

// Service Admin (or PRIME) — all tickets for a service, checked inline
// in the controller itself
router.get("/service/:serviceId", getServiceTickets);

// ---------------------------------------------------------------------
// Single ticket (access checked inline via hasTicketAccess)
// ---------------------------------------------------------------------
router.get("/:id", getTicketById);

// ---------------------------------------------------------------------
// Assignment (Service Admin of the ticket's service, or PRIME)
// ---------------------------------------------------------------------
router.post("/:id/assign", requireServiceAdminOfTicket, assignTicket);
router.post("/:id/reject", requireServiceAdminOfTicket, adminRejectTicket);

// ---------------------------------------------------------------------
// Status update — Service Emp updates their own row
// (controller itself verifies the caller owns a row in assignedTo[])
// ---------------------------------------------------------------------
router.put("/:id/my-status", updateAssignmentStatus);

// ---------------------------------------------------------------------
// Chat (access checked inline via hasTicketAccess)
// ---------------------------------------------------------------------
router.post("/:id/comments", addComment);
router.get("/:id/comments", getComments);

// ---------------------------------------------------------------------
// Attachments (access checked inline via hasTicketAccess)
// ---------------------------------------------------------------------
router.get("/:ticketId/attachments/:fileId", downloadAttachment);

// ---------------------------------------------------------------------
// Feedback submission — ticket creator only, RESOLVED tickets only
// (controller itself verifies both)
// ---------------------------------------------------------------------
router.post("/:id/feedback", submitFeedback);

module.exports = router;
