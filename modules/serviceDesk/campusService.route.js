const express = require("express");
const router = express.Router();

const studentAuth = require("./studentAuth.controller");
const studentService = require("./studentService.controller");
const upload = require("./upload.middleware");
const ticketNumber = require("./ticketNumber.middleware");

// --- Public Auth Endpoints (No Token Required) ---
router.post("/auth/send-otp", studentAuth.sendStudentOtp);
router.post("/auth/verify-otp", studentAuth.verifyStudentOtp);
router.post("/auth/logout", studentAuth.logoutStudent);
router.post("/auth/clear-staff-session", studentAuth.clearStaffSession);

// --- Authenticated Student Endpoints (Requires Student Token) ---
router.use(studentService.verifyStudentAuth);

// Profile
router.get("/auth/me", studentAuth.getStudentProfile);

// Meta: Available services and blocks
router.get("/services-and-blocks", studentService.getPublicServicesAndBlocks);

// Tickets
router.post("/tickets", ticketNumber, upload.array("attachments", 5), studentService.createStudentTicket);
router.get("/my-tickets", studentService.getMyStudentTickets);
router.get("/tickets/:id", studentService.getStudentTicketDetail);

// Feedback & Comments
router.post("/tickets/:id/feedback", studentService.submitStudentFeedback);
router.get("/tickets/:id/comments", studentService.getStudentComments);
router.post("/tickets/:id/comments", studentService.addStudentComment);

module.exports = router;
