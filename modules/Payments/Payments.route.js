const express = require('express');
const router = express.Router();
const paymentsController = require('./Payments.controller');

// List payment registrations
router.get('/registrations', paymentsController.getRegistrations);

// Create a new Razorpay order
router.post('/create-order', paymentsController.createOrder);

// Verify a completed payment and save registration details
router.post('/verify-payment', paymentsController.verifyPayment);

module.exports = router;
