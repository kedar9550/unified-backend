const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { protect, authorize } = require('../../middlewares/authMiddleware');

router.get('/uniprime', protect, authorize('UNIPRIME'), dashboardController.getUniprimeDashboardData);
router.get('/feedback', protect, authorize('FEEDBACK COORDINATOR', 'UNIPRIME', 'ADMIN'), dashboardController.getFeedbackDashboardData);

module.exports = router;
