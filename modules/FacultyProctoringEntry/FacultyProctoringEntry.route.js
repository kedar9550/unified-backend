const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middlewares/authMiddleware");
const facultyProctoringController = require("./FacultyProctoringEntry.controller");

// Faculty: Submit, edit, delete, and view own
router.post("/", protect, facultyProctoringController.createEntry);
router.get("/my-entries", protect, facultyProctoringController.getMyEntries);
router.put("/:id", protect, facultyProctoringController.updateEntry);
router.delete("/:id", protect, facultyProctoringController.deleteEntry);

// HOD: View department proctoring entries and Approve/Reject
router.get("/pending-hod", protect, authorize("HOD", "DEPARTMENT HOD"), facultyProctoringController.getPendingAtHOD);
router.put("/hod-action/:id", protect, authorize("HOD", "DEPARTMENT HOD"), facultyProctoringController.hodAction);
router.post("/hod-action-bulk", protect, authorize("HOD", "DEPARTMENT HOD"), facultyProctoringController.hodBulkAction);

module.exports = router;
