const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const textbookController = require('./Textbook.controller');

const primaryEvaluatorRoles = [
    "DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN", 
    "VICE CHANCELLOR", "VICE_CHANCELLOR", 
    "DY. PRO CHANCELLOR", "DY_PRO_CHANCELLOR", 
    "REGISTRAR",
    "PRO VICE-CHANCELLOR (E & S)", "PRO_VICE_CHANCELLOR_E_S",
    "PRO VICE-CHANCELLOR (A)", "PRO_VICE_CHANCELLOR_A",
    "PRO VICE-CHANCELLOR (S & P)", "PRO_VICE_CHANCELLOR_S_P",
    "DEAN - (IQAC)", "DEAN_IQAC",
    "DEAN - (ADMISSIONS)", "DEAN_ADMISSIONS",
    "CONTROLLER OF EXAMINATIONS", "CONTROLLER_OF_EXAMINATIONS"
];

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
    limits: { fileSize: 200 * 1024 }, // 200KB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();

if (allowed.includes(ext) || file.mimetype === 'application/pdf') return cb(null, true);
        cb(new Error('Only PDF files are allowed. Max size 200KB.'));
    }
});

// --- Routes ---

// New Endpoints
router.get('/isbn/:isbn', protect, textbookController.fetchISBN);
router.get('/editions', protect, textbookController.getEditions);
router.post('/editions', protect, textbookController.addEdition);

// Faculty: Submit and View own
router.post('/', protect, upload.fields([
    { name: 'coverPage', maxCount: 1 },
    { name: 'authorAffiliation', maxCount: 1 },
    { name: 'index', maxCount: 1 }
]), textbookController.createTextbook);

router.get('/', protect, textbookController.getMyTextbooks);
router.get('/:id', protect, textbookController.getTextbookById);

// Faculty: Update/Resubmit rejected textbook
router.put('/:id', protect, upload.fields([
    { name: 'coverPage', maxCount: 1 },
    { name: 'authorAffiliation', maxCount: 1 },
    { name: 'index', maxCount: 1 }
]), textbookController.updateTextbook);

// HOD: View pending and Action
router.get('/pending-hod', protect, authorize(...primaryEvaluatorRoles), textbookController.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize(...primaryEvaluatorRoles), textbookController.hodAction);

// R&D: View pending and Action
router.get('/pending-rnd', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), textbookController.getPendingAtRND);
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), textbookController.rndAction);

// Faculty: Raise discrepancy
router.put('/raise-discrepancy/:id', protect, upload.single('discrepancyProof'), textbookController.raiseDiscrepancy);

// R&D: Edit after discrepancy
router.put('/rnd-edit/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), upload.fields([
    { name: 'coverPage', maxCount: 1 },
    { name: 'authorAffiliation', maxCount: 1 },
    { name: 'index', maxCount: 1 }
]), textbookController.rndEdit);

module.exports = router;
