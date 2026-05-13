const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const hodResearchController = require('./hodResearch.controller');

router.get('/', protect, authorize('HOD'), hodResearchController.getResearchRequests);

module.exports = router;
