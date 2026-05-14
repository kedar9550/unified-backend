const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const researchApprovalController = require('./researchApproval.controller');

// Main route for fetching research requests for approval
// Access restricted to HODs and R&D Administration
router.get('/', protect, authorize('HOD', 'RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), researchApprovalController.getResearchRequests);

module.exports = router;
