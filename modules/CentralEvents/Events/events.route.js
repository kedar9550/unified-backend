const express = require('express');
const router = express.Router();
const controller = require('./events.controller');
const { protect, authorize } = require('../../../middlewares/authMiddleware');
const upload = require('./eventsUpload.middleware');

const adminRoles = ['GLOBAL_EVENT_ADMIN', 'SUPER_ADMIN'];

// Public Catalog APIs
router.get('/organizers', controller.getOrganizers);
router.get('/central-events', controller.getCentralEvents);
router.get('/central-events/:slug', controller.getCentralEventBySlug);

// Admin Management APIs
router.post('/central-events', protect, authorize(...adminRoles), controller.createCentralEvent);
router.put('/central-events/:id', protect, authorize(...adminRoles), controller.updateCentralEvent);
router.patch('/central-events/:id/publish', protect, authorize(...adminRoles), controller.publishCentralEvent);
router.patch('/central-events/:id/cancel', protect, authorize(...adminRoles), controller.cancelCentralEvent);
router.post('/central-events/upload', protect, authorize(...adminRoles), upload.single('file'), controller.uploadCentralEventFile);

module.exports = router;
