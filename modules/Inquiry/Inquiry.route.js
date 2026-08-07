const express = require('express');
const router = express.Router();
const inquiryController = require('./Inquiry.controller');

router.post('/', inquiryController.createInquiry);
router.get('/', inquiryController.getAllInquiries);

module.exports = router;
