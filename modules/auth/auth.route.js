const express = require('express');
const router = express.Router();
const {
    checkEmployee,
    sendOtp,
    verifyOtp,
    resetPassword
} = require('./auth.controller');

router.post('/check-employee', checkEmployee);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

module.exports = router;
