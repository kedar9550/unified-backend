const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const controller = require('./Contribution.controller');

// Multer setup
const uploadDir = path.join(__dirname, '../../uploads/contributions');
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
    limits: { fileSize: 1024 * 1024 }, // 1MB limit for safety, checked at 500KB in controller
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only PDF and image files (JPG, JPEG, PNG) are allowed. Max size 500KB.'));
    }
});

// --- Routes ---

// HOD Routes
router.get('/pending-hod', protect, authorize('HOD'), controller.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize('HOD'), controller.hodAction);
router.post('/hod-bulk-action', protect, authorize('HOD'), controller.bulkHODAction);

// Faculty Routes
router.post('/', protect, upload.single('proof'), controller.createContribution);
router.post('/submit-academic-year', protect, controller.submitAcademicYear);
router.get('/', protect, controller.getMyContributions);
router.put('/:id', protect, upload.single('proof'), controller.updateContribution);
router.delete('/:id', protect, controller.deleteContribution);

module.exports = router;
