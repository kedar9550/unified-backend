const express = require('express');
const router = express.Router();
const controller = require('./eventTypes.controller');
const { protect, authorize } = require('../../../middlewares/authMiddleware');

const adminRoles = ['GLOBAL_EVENT_ADMIN', 'SUPER_ADMIN'];

// Public Event Types API
router.get('/central-event-types', controller.getCentralEventTypes);

// Admin Event Types CRUD
router.get('/central-event-types/all', protect, authorize(...adminRoles), controller.getAllCentralEventTypesAdmin);
router.post('/central-event-types', protect, authorize(...adminRoles), controller.createCentralEventType);
router.put('/central-event-types/:id', protect, authorize(...adminRoles), controller.updateCentralEventType);
router.delete('/central-event-types/:id', protect, authorize(...adminRoles), controller.deleteCentralEventType);

module.exports = router;
