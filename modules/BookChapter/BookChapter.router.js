const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const bookChapterController = require('./BookChapter.controller');

// Multer setup
const uploadDir = path.join(__dirname, '../../uploads/book-chapters');
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
    limits: { fileSize: 1024 * 1024 }, // Set to 1MB, but we will validate for 500KB in controller/frontend for better messaging
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only PDF and image files are allowed. Max size 500KB.'));
    }
});

// --- Routes ---

// Faculty: Submit and View own
router.post('/', protect, upload.fields([
    { name: 'coverPage', maxCount: 1 },
    { name: 'authorAffiliation', maxCount: 1 },
    { name: 'index', maxCount: 1 },
    { name: 'softCopy', maxCount: 1 }
]), bookChapterController.createBookChapter);

router.get('/', protect, bookChapterController.getMyBookChapters);
router.get('/:id', protect, bookChapterController.getBookChapterById);

// HOD: View pending and Action
router.get('/pending-hod', protect, authorize('HOD'), bookChapterController.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize('HOD'), bookChapterController.hodAction);

// R&D: View pending and Action
router.get('/pending-rnd', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), bookChapterController.getPendingAtRND);
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), bookChapterController.rndAction);

module.exports = router;
