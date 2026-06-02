const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const journalController = require('./Journal.controller');

// Multer setup
const uploadDir = path.join(__dirname, '../../uploads/journals');
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
    limits: { fileSize: 1024 * 1024 }, // Set to 1MB, but we will validate for 500KB in controller
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only PDF, DOCX and image files are allowed. Max size 500KB.'));
    }
});

// --- Routes ---

// Faculty: Submit and View own
router.post('/', protect, upload.fields([
    { name: 'publishedPaper', maxCount: 1 },
    { name: 'referencePages', maxCount: 1 },
    { name: 'completeJournal', maxCount: 1 }
]), journalController.createJournal);

router.get('/', protect, journalController.getMyJournals);
router.post('/wos-type', journalController.getClarivateJournalType);
router.get('/:id', protect, journalController.getJournalById);

// HOD: View pending and Action
router.get('/pending-hod', protect, authorize('HOD'), journalController.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize('HOD'), journalController.hodAction);

// R&D: View pending and Action
router.get('/pending-rnd', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), journalController.getPendingAtRND);
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), journalController.rndAction);
router.put('/update-metrics/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), journalController.updateJournalMetrics);

module.exports = router;
