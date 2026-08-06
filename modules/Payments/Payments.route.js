const express = require('express');
const router = express.Router();
const paymentsController = require('./Payments.controller');

// Dashboard statistics (aggregated from all registrations)
router.get('/stats', paymentsController.getDashboardStats);

// List payment registrations
router.get('/registrations', paymentsController.getRegistrations);

// Create a new Razorpay order
router.post('/create-order', paymentsController.createOrder);

// Verify a completed payment and save registration details
router.post('/verify-payment', paymentsController.verifyPayment);

// Scan participant barcode
router.post('/scan-barcode', paymentsController.scanBarcode);
router.post('/scan-accommodation', paymentsController.scanAccommodationBarcode);

// Accommodation Payments
router.post('/accommodation/create-order', paymentsController.createAccommodationOrder);
router.post('/accommodation/verify', paymentsController.verifyAccommodationPayment);
router.put('/update-attendance', paymentsController.updateAttendance);
router.put('/registrations/:id/winner', paymentsController.updateWinnerStatus);

module.exports = router;
