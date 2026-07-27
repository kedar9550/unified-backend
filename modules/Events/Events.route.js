const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const eventsController = require('./Events.controller');

// --- Routes ---
router.post('/', protect, authorize('STUDENT_EVENT_ADMIN'), eventsController.createEvent);
router.get('/', eventsController.getAllEvents);
router.get('/:id', protect, eventsController.getEventById);
router.put('/:id', protect, authorize('STUDENT_EVENT_ADMIN'), eventsController.updateEvent);
router.delete('/:id', protect, authorize('STUDENT_EVENT_ADMIN'), eventsController.deleteEvent);

module.exports = router;
