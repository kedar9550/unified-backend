const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const conferenceController = require('./Conference.controller');

// Multer setup
const uploadDir = path.join(__dirname, '../../uploads/conferences');
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
    limits: { fileSize: 1024 * 1024 }, // 1MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only PDF and image files are allowed.'));
    }
});

// --- Routes ---

// Faculty: Submit and View own
router.post('/', protect, upload.fields([
    { name: 'certificate', maxCount: 1 },
    { name: 'proceedings', maxCount: 1 }
]), conferenceController.createConference);

router.get('/', protect, conferenceController.getMyConferences);
router.get('/:id', protect, conferenceController.getConferenceById);

// HOD: Action
router.put('/hod-action/:id', protect, authorize('HOD'), conferenceController.hodAction);

// R&D: Action
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), conferenceController.rndAction);

module.exports = router;
