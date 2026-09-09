const express = require('express');
const router = express.Router();
const {
    getPayslips,
    getPayslipYears,
    createPayslip,
    sendPayslipEmail,
    downloadPayslipPdf
} = require('./Payslips.controller');

const { protect } = require('../../middlewares/authMiddleware');

// Protected routes (Requires logged in user)
router.use(protect);

router.get('/years', getPayslipYears);
router.get('/', getPayslips);
router.post('/', createPayslip);
router.post('/send-email', sendPayslipEmail);
router.get('/download', downloadPayslipPdf);

module.exports = router;
