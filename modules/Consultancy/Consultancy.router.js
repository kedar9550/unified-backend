const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const consultancyController = require('./Consultancy.controller');

// Faculty: Submit and View own
router.post('/', protect, consultancyController.createConsultancy);
router.get('/', protect, consultancyController.getMyConsultancies);
router.get('/:id', protect, consultancyController.getConsultancyById);

// HOD: Action
router.put('/hod-action/:id', protect, authorize('HOD'), consultancyController.hodAction);

// R&D: Action
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), consultancyController.rndAction);

module.exports = router;
