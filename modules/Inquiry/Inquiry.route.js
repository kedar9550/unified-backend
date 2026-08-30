const express = require('express');
const router = express.Router();
const inquiryController = require('./Inquiry.controller');

router.post('/', inquiryController.createInquiry);
router.get('/', inquiryController.getAllInquiries);
router.patch('/:id/status', inquiryController.updateInquiryStatus);
router.put('/:id/status', inquiryController.updateInquiryStatus);
router.delete('/:id', inquiryController.deleteInquiry);

module.exports = router;
