const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const eventDepartmentController = require('./EventDepartment.controller');

// ─── Routes ───────────────────────────────────────────────────────────────────
router.post(
    '/',
    protect,
    authorize('STUDENT_EVENT_ADMIN', 'STUDENT EVENT ADMIN', 'VEDA_ADMIN', 'VEDA ADMIN'),
    eventDepartmentController.createDepartment
);

router.get('/', eventDepartmentController.getAllDepartments);

router.get('/:id', eventDepartmentController.getDepartmentById);

router.put(
    '/:id',
    protect,
    authorize('STUDENT_EVENT_ADMIN', 'STUDENT EVENT ADMIN', 'VEDA_ADMIN', 'VEDA ADMIN'),
    eventDepartmentController.updateDepartment
);

router.delete(
    '/:id',
    protect,
    authorize('STUDENT_EVENT_ADMIN', 'STUDENT EVENT ADMIN', 'VEDA_ADMIN', 'VEDA ADMIN'),
    eventDepartmentController.deleteDepartment
);

module.exports = router;
