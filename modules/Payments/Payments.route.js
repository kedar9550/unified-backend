const express = require('express');
const router = express.Router();
const paymentsController = require('./Payments.controller');

const multer = require('multer');
const fs = require('fs');
const path = require('path');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../uploads/othercollegephotos');
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const roll = req.body.rollnumber || 'unknown';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `photo-${roll}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage: storage });

// Dashboard statistics (aggregated from all registrations)
router.get('/stats', paymentsController.getDashboardStats);

// List payment registrations
router.get('/registrations', paymentsController.getRegistrations);
router.delete('/registrations/:id', paymentsController.deleteRegistration);

// Create a new Razorpay order
router.post('/create-order', paymentsController.createOrder);

// Verify a completed payment and save registration details
router.post('/verify-payment', paymentsController.verifyPayment);

// Manual Approve & Verify Gateway
router.put('/registrations/manual-approve/:id', paymentsController.manualApprovePayment);
router.get('/registrations/verify-gateway/:id', paymentsController.verifyGatewayPayment);
router.get('/registrations/branch/:roll', paymentsController.getStudentBranch);

// Scan participant barcode
router.post('/scan-barcode', paymentsController.scanBarcode);
router.post('/scan-accommodation', paymentsController.scanAccommodationBarcode);

// Accommodation Payments
router.post('/accommodation/create-order', paymentsController.createAccommodationOrder);
router.post('/accommodation/verify', paymentsController.verifyAccommodationPayment);
router.put('/update-attendance', paymentsController.updateAttendance);
router.put('/registrations/:id/winner', paymentsController.updateWinnerStatus);


// Participant Photo Upload
router.post('/registrations/photo', upload.single('photo'), paymentsController.uploadPhoto);
router.get('/registrations/photo/:roll', paymentsController.checkPhoto);
router.get('/registrations/photo/:roll/image', paymentsController.servePhoto);

module.exports = router;
