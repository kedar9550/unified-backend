const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const notificationController = require('./notification.controller');

// All routes require authentication
router.use(protect);

router.get('/', notificationController.getUserNotifications);
router.put('/read-all', notificationController.markAllAsRead);
router.put('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
