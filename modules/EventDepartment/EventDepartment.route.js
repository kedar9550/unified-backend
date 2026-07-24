const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const eventDepartmentController = require('./EventDepartment.controller');

// ─── Routes ───────────────────────────────────────────────────────────────────
router.post(
    '/',
    protect,
    authorize('STUDENT EVENT ADMIN'),
    eventDepartmentController.createDepartment
);

router.get('/', protect, eventDepartmentController.getAllDepartments);

router.get('/:id', protect, eventDepartmentController.getDepartmentById);

router.put(
    '/:id',
    protect,
    authorize('STUDENT EVENT ADMIN'),
    eventDepartmentController.updateDepartment
);

router.delete(
    '/:id',
    protect,
    authorize('STUDENT EVENT ADMIN'),
    eventDepartmentController.deleteDepartment
);

module.exports = router;
