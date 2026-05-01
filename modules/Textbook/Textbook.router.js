const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../../middlewares/authMiddleware');
const textbookController = require('./Textbook.controller');

// Multer setup
const uploadDir = path.join(__dirname, '../../uploads/textbooks');
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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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
    { name: 'coverPage', maxCount: 1 },
    { name: 'authorAffiliation', maxCount: 1 },
    { name: 'index', maxCount: 1 }
]), textbookController.createTextbook);

router.get('/', protect, textbookController.getMyTextbooks);

// HOD: View pending and Action
router.get('/pending-hod', protect, textbookController.getPendingAtHOD);
router.put('/hod-action/:id', protect, textbookController.hodAction);

// R&D: View pending and Action
router.get('/pending-rnd', protect, textbookController.getPendingAtRND);
router.put('/rnd-action/:id', protect, textbookController.rndAction);

// Faculty: Raise discrepancy
router.put('/raise-discrepancy/:id', protect, upload.single('discrepancyProof'), textbookController.raiseDiscrepancy);

// R&D: Edit after discrepancy
router.put('/rnd-edit/:id', protect, upload.fields([
    { name: 'coverPage', maxCount: 1 },
    { name: 'authorAffiliation', maxCount: 1 },
    { name: 'index', maxCount: 1 }
]), textbookController.rndEdit);

module.exports = router;
