const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../../middlewares/authMiddleware');
const jmController = require('./JournalMaster.controller');

// Secure all endpoints under research deans and coordinators
router.use(protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'));

router.get('/', jmController.getJournalMasters);
router.post('/', jmController.addJournalMaster);
router.put('/:id', jmController.updateJournalMaster);
router.delete('/:id', jmController.deleteJournalMaster);

module.exports = router;
