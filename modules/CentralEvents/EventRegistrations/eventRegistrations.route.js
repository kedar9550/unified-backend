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


// Fest Portal Student Registration & Payments (public fest access)
router.get('/central-events/check-student/:roll', controller.checkStudentExists);
router.get('/central-event-registrations/check-student/:roll', controller.checkStudentExists);
router.post('/central-event-registrations', controller.createStudentRegistrationAndPayment);
router.post('/central-events/student-registrations', controller.createStudentRegistrationAndPayment);
router.get('/central-event-registrations/student/:roll', controller.getStudentRegistrationsByRoll);

// Admin Central Event Payments & Verification (using Razorpay Gateway at Admin Side)
router.post('/central-event-payments/verify-gateway', controller.verifyStudentPaymentGateway);
router.get('/central-event-payments', controller.listStudentPaymentsAdmin);
router.get('/central-event-student-registrations', controller.listStudentRegistrationsAdmin);

module.exports = router;
