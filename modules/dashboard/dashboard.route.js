const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { protect, authorize } = require('../../middlewares/authMiddleware');

router.get('/uniprime', protect, authorize('UNIPRIME'), dashboardController.getUniprimeDashboardData);
router.get('/feedback', protect, authorize('FEEDBACK_COORDINATOR', 'UNIPRIME', 'ADMIN'), dashboardController.getFeedbackDashboardData);
router.get('/exam', protect, authorize('EXAMSECTION', 'UNIPRIME', 'ADMIN'), dashboardController.getExamDashboardData);
router.get('/hod', protect, authorize('HOD'), dashboardController.getHODDashboardData);
router.get('/school-dean', protect, authorize('SCHOOL_DEAN'), dashboardController.getHODDashboardData);
router.get('/research-dean', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), dashboardController.getResearchDeanDashboardData);
router.get('/faculty', protect, authorize('FACULTY', 'STAFF'), dashboardController.getFacultyDashboardData);
router.get('/leadership', protect, authorize(
    "VICE CHANCELLOR", "DY. PRO CHANCELLOR", "REGISTRAR", 
    "PRO VICE-CHANCELLOR (E & S)", "PRO VICE-CHANCELLOR (A)", "PRO VICE-CHANCELLOR (S & P)",
    "DEAN - (IQAC)", "DEAN - (ADMISSIONS)",
    "PRO_VICE_CHANCELLOR_E_S", "PRO_VICE_CHANCELLOR_A", "PRO_VICE_CHANCELLOR_S_P",
    "VICE_CHANCELLOR", "DY_PRO_CHANCELLOR", "DEAN_IQAC", "DEAN_ADMISSIONS",
    "CONTROLLER_OF_EXAMINATIONS", "CONTROLLER OF EXAMINATIONS"
), dashboardController.getLeadershipDashboardData);

module.exports = router;
