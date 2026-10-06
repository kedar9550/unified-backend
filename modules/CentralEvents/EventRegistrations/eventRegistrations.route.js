const express = require('express');
const router = express.Router();
const controller = require('./eventRegistrations.controller');
const { protect } = require('../../../middlewares/authMiddleware');

router.post('/central-events/:id/register', protect, controller.registerForCentralEvent);
router.get('/central-event-registrations/my', protect, controller.getMyRegistrations);
router.get('/central-event-registrations/:id', protect, controller.getRegistrationById);

module.exports = router;
