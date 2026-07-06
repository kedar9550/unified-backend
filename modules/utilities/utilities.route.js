const express = require('express');
const router = express.Router();
const {
    createShortUrl,
    createQrCode,
    getMyUtilities,
    getAllUtilitiesAdmin,
    updateUtilityStatus,
    softDeleteUtility,
    hardDeleteUtility,
    redirectUrl,
    updateMyUtilityStatus,
    softDeleteMyUtility
} = require('./utilities.controller');

// Middlewares
const { protect, authorize } = require('../../middlewares/authMiddleware');

// Public route for redirection
router.get('/r/:shortCode', redirectUrl);

// Protected routes (Any logged in user)
router.use(protect);

router.post('/shorten-url', createShortUrl);
router.post('/generate-qr', createQrCode);
router.get('/my-links', getMyUtilities);
router.put('/:id/status', updateMyUtilityStatus);
router.delete('/:id/soft-delete', softDeleteMyUtility);

// Admin / UNIPRIME Routes
router.use(authorize('UNIPRIME', 'ADMIN')); // Note: Check existing roles in your system

router.get('/admin/all', getAllUtilitiesAdmin);
router.put('/admin/:id/status', updateUtilityStatus);
router.delete('/admin/:id/soft-delete', softDeleteUtility);
router.delete('/admin/:id/hard-delete', hardDeleteUtility);

module.exports = router;
