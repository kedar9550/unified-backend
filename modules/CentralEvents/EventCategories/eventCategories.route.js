const express = require('express');
const router = express.Router();
const controller = require('./eventCategories.controller');
const { protect, authorize } = require('../../../middlewares/authMiddleware');

const adminRoles = ['GLOBAL_EVENT_ADMIN', 'SUPER_ADMIN'];

// Public Category Route
router.get('/central-event-types/:code/categories', controller.getCategoriesByTypeCode);

// Admin Category Routes
router.get('/central-event-categories/admin', protect, authorize(...adminRoles), controller.getAllCentralEventCategoriesAdmin);
router.post('/central-event-categories', protect, authorize(...adminRoles), controller.createCentralEventCategory);
router.put('/central-event-categories/:id', protect, authorize(...adminRoles), controller.updateCentralEventCategory);
router.delete('/central-event-categories/:id', protect, authorize(...adminRoles), controller.deleteCentralEventCategory);

module.exports = router;
