const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const researchApprovalController = require('./researchApproval.controller');

// Main route for fetching research requests for approval
// Access restricted to HODs and R&D Administration
router.get('/', protect, authorize('HOD', 'RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), researchApprovalController.getResearchRequests);

// Consolidated reports route for Research Admin
router.get('/reports', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), researchApprovalController.getResearchReports);

module.exports = router;
