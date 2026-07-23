const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const eventAssignmentController = require('./EventAssignment.controller');

// --- Routes ---
router.post('/', protect, authorize('STUDENT EVENT ADMIN'), eventAssignmentController.createAssignment);
router.get('/mine/fests', protect, authorize('CONVENER'), eventAssignmentController.getMyFestAssignments);
router.get('/', protect, eventAssignmentController.getAllAssignments);
router.put('/:id', protect, authorize('STUDENT EVENT ADMIN'), eventAssignmentController.updateAssignment);
router.delete('/:id', protect, authorize('STUDENT EVENT ADMIN'), eventAssignmentController.deleteAssignment);

module.exports = router;
