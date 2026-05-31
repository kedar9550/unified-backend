const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const phdScholarController = require('./PhdScholar.controller');

// Multer directory setup for PhD supporting documents
const uploadDir = path.join(__dirname, '../../uploads/phdScholars');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 }, // Set to 1MB, validate for 500KB in front-end/controller
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only PDF and image files are allowed. Max size 500KB.'));
    }
});

// --- Routes ---

// Student Validation (ECAP lookup)
router.get('/validate/:rollNo', protect, phdScholarController.validateScholar);

// Faculty: Submit and View own history
router.post('/', protect, upload.single('document'), phdScholarController.createPhdApplication);
router.get('/', protect, phdScholarController.getMyApplications);
router.get('/:id', protect, phdScholarController.getApplicationById);

// HOD: View pending and Action
router.get('/pending-hod', protect, authorize('HOD'), phdScholarController.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize('HOD'), phdScholarController.hodAction);

// R&D: View pending and Action
router.get('/pending-rnd', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), phdScholarController.getPendingAtRND);
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), phdScholarController.rndAction);

module.exports = router;
