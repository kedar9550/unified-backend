const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middlewares/authMiddleware");
const facultyAdministrationController = require("./FacultyAdministration.controller");

// Faculty: Submit and view own
router.post("/", protect, facultyAdministrationController.createOrUpdateEntry);
router.get("/my-entries", protect, facultyAdministrationController.getMyEntries);

// HOD: View department faculty declarations and Approve/Reject
router.get("/pending-hod", protect, authorize("HOD"), facultyAdministrationController.getPendingAtHOD);
router.put("/hod-action/:id", protect, authorize("HOD"), facultyAdministrationController.hodAction);

module.exports = router;
