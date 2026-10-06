const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const controller = require('./eventPayments.controller');
const { protect } = require('../../../middlewares/authMiddleware');

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { success: false, error: 'Too many payment requests from this client. Please wait 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/payments/session/:token', paymentLimiter, protect, controller.getPaymentSession);
router.post('/payments/verify', paymentLimiter, protect, controller.verifyPaymentSignature);

module.exports = router;
