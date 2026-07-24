const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const eventAssignmentController = require('./EventAssignment.controller');

// --- Routes ---
router.post('/', protect, authorize('STUDENT_EVENT_ADMIN'), eventAssignmentController.createAssignment);
router.get('/mine/fests', protect, authorize('CONVENER'), eventAssignmentController.getMyFestAssignments);
router.get('/', protect, eventAssignmentController.getAllAssignments);
router.put('/:id', protect, authorize('STUDENT_EVENT_ADMIN'), eventAssignmentController.updateAssignment);
router.delete('/:id', protect, authorize('STUDENT_EVENT_ADMIN'), eventAssignmentController.deleteAssignment);

module.exports = router;
