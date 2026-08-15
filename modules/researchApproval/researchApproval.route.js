const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const researchApprovalController = require('./researchApproval.controller');

// Multer setup for Research Dean/Coordinator to edit files
const uploadDir = path.join(__dirname, '../../uploads/research_docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Main route for fetching research requests for approval
// Access restricted to HODs, Deans and R&D Administration
router.get('/', protect, authorize('HOD', 'SCHOOL_DEAN', 'RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), researchApprovalController.getResearchRequests);

// Consolidated reports route for Research Admin
router.get('/reports', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), researchApprovalController.getResearchReports);

// Route for R&D Dean/Coordinator to edit research details in-place
router.put('/:type/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), upload.any(), researchApprovalController.editResearchDetails);

// router.put('/:type/:id/status', protect, authorize('HOD', 'SCHOOL_DEAN', 'RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), researchApprovalController.updateResearchStatus);

module.exports = router;
