const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const consultancyController = require('./Consultancy.controller');

// Faculty: Submit and View own
router.post('/', protect, consultancyController.createConsultancy);
router.get('/', protect, consultancyController.getMyConsultancies);

// HOD: Action (must be before /:id)
router.put('/hod-action/:id', protect, authorize('HOD'), consultancyController.hodAction);

// R&D: Action (must be before /:id)
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), consultancyController.rndAction);

// Generic ID routes (must be AFTER specific named routes)
router.get('/:id', protect, consultancyController.getConsultancyById);

// Faculty: Update/Resubmit rejected consultancy
router.put('/:id', protect, consultancyController.updateConsultancy);

module.exports = router;
