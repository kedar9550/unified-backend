const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const hodResearchController = require('./hodResearch.controller');

router.get('/', protect, authorize('HOD', 'RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), hodResearchController.getResearchRequests);

module.exports = router;
