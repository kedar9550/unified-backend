const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { protect, authorize } = require('../../middlewares/authMiddleware');

router.get('/uniprime', protect, authorize('UNIPRIME'), dashboardController.getUniprimeDashboardData);
router.get('/feedback', protect, authorize('FEEDBACK COORDINATOR', 'UNIPRIME', 'ADMIN'), dashboardController.getFeedbackDashboardData);
router.get('/exam', protect, authorize('EXAMSECTION', 'UNIPRIME', 'ADMIN'), dashboardController.getExamDashboardData);
router.get('/hod', protect, authorize('HOD'), dashboardController.getHODDashboardData);
router.get('/research-dean', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), dashboardController.getResearchDeanDashboardData);

module.exports = router;
