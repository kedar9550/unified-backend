const express = require('express');
const router = express.Router();
const controller = require('./eventRegistrations.controller');
const { protect, authorize } = require('../../../middlewares/authMiddleware');

const adminRoles = ['GLOBAL_EVENT_ADMIN', 'SUPER_ADMIN'];

// Student / User Registration Routes
router.post('/central-events/:id/register', protect, controller.registerForCentralEvent);
router.get('/central-event-registrations/my', protect, controller.getMyRegistrations);

// Admin Registration Routes (GLOBAL_EVENT_ADMIN)
router.get('/central-event-registrations/admin', protect, authorize(...adminRoles), controller.getAllRegistrationsAdmin);
router.get('/central-event-registrations/:id', protect, controller.getRegistrationById);

module.exports = router;
