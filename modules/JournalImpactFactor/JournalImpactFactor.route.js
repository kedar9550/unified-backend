const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../../middlewares/authMiddleware');
const jifController = require('./JournalImpactFactor.controller');

// Secure all endpoints under research deans and coordinators
router.use(protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'));

router.get('/', jifController.getJournalImpactFactors);
router.post('/', jifController.addJournalImpactFactor);
router.put('/:id', jifController.updateJournalImpactFactor);
router.delete('/:id', jifController.deleteJournalImpactFactor);

module.exports = router;
