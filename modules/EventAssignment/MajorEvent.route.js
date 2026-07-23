const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const controller = require('./MajorEvent.controller');

router.use(protect, authorize('MAJOR EVENT ADMIN'));
router.get('/groups', controller.getMyGroups);
router.get('/groups/:groupId/events', controller.getGroupEvents);
router.post('/events', controller.createEvent);
router.put('/events/:id', controller.updateEvent);
router.delete('/events/:id', controller.deleteEvent);

module.exports = router;