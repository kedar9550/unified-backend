const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middlewares/authMiddleware");
const facultyAdministrationController = require("./FacultyAdministration.controller");

// Faculty: Submit and view own
router.post("/", protect, facultyAdministrationController.createOrUpdateEntry);
router.get("/my-entries", protect, facultyAdministrationController.getMyEntries);

// HOD: View department faculty declarations and Approve/Reject
const primaryEvaluatorRoles = [
    "DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN", 
    "VICE CHANCELLOR", "VICE_CHANCELLOR", 
    "DY. PRO CHANCELLOR", "DY_PRO_CHANCELLOR", 
    "REGISTRAR",
    "PRO VICE-CHANCELLOR (E & S)", "PRO_VICE_CHANCELLOR_E_S",
    "PRO VICE-CHANCELLOR (A)", "PRO_VICE_CHANCELLOR_A",
    "PRO VICE-CHANCELLOR (S & P)", "PRO_VICE_CHANCELLOR_S_P",
    "DEAN - (IQAC)", "DEAN_IQAC",
    "DEAN - (ADMISSIONS)", "DEAN_ADMISSIONS",
    "CONTROLLER OF EXAMINATIONS", "CONTROLLER_OF_EXAMINATIONS"
];

router.get("/pending-hod", protect, authorize(...primaryEvaluatorRoles), facultyAdministrationController.getPendingAtHOD);
router.put("/hod-action-role/:id", protect, authorize(...primaryEvaluatorRoles), facultyAdministrationController.hodActionRole);

module.exports = router;
