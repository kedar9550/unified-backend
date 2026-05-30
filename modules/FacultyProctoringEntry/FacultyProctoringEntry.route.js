const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middlewares/authMiddleware");
const facultyProctoringController = require("./FacultyProctoringEntry.controller");

// Faculty: Submit and view own
router.post("/", protect, facultyProctoringController.createEntry);
router.get("/my-entries", protect, facultyProctoringController.getMyEntries);

// HOD: View department proctoring entries and Approve/Reject
router.get("/pending-hod", protect, authorize("HOD"), facultyProctoringController.getPendingAtHOD);
router.put("/hod-action/:id", protect, authorize("HOD"), facultyProctoringController.hodAction);

module.exports = router;
