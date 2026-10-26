const express = require('express');
const router = express.Router();
const activityHubController = require('./activityHub.controller');
const { protect } = require('../../middlewares/authMiddleware');

// All Activity Hub routes require valid authentication
router.use(protect);

// ==========================================
// STUDENT PORTAL ENDPOINTS
// ==========================================
// List enabled activities available for student registration
router.get('/student/available', activityHubController.getStudentActivities);

// Self-service student registration for an enabled activity
router.post('/student/register', activityHubController.registerStudentForActivity);

// Current student's own registered activities list
router.get('/student/my-registrations', activityHubController.getMyRegistrations);

// ==========================================
// FACULTY & ADMIN MANAGEMENT ENDPOINTS
// ==========================================
// Dashboard statistics
router.get('/stats', activityHubController.getStats);

// Registrations roster view
router.get('/registrations', activityHubController.getActivityRegistrations);

// Export registrations to Excel (.xlsx)
router.get('/registrations/export', activityHubController.exportActivityRegistrations);

// List activities (scoped by role)
router.get('/', activityHubController.getActivities);

// Create new activity (defaults to isEnabled = false)
router.post('/', activityHubController.createActivity);

// Get single activity details
router.get('/:id', activityHubController.getActivityById);

// Update activity details
router.put('/:id', activityHubController.updateActivity);

// Toggle isEnabled status (Enable / Disable)
router.patch('/:id/toggle-status', activityHubController.toggleActivityStatus);

module.exports = router;
