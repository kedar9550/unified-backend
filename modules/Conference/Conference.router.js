const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const conferenceController = require('./Conference.controller');

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

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// [NEW] DOI Validation via Scopus — call this before form submission
// POST /api/research/conference/validate-doi
// Body: { "doi": "10.1109/ICCR55977.2022.9995935" }
//
// ✅ Returns 200 with fetched data if it's a valid conference paper
// ❌ Returns 422 if it's a journal/article
// ❌ Returns 404 if DOI not found in Scopus
router.post('/validate-doi', protect, conferenceController.validateDOI);

// Faculty: Submit and View own
router.post('/', protect, upload.fields([
    { name: 'certificate', maxCount: 1 },
    { name: 'proceedings', maxCount: 1 }
]), conferenceController.createConference);

router.get('/', protect, conferenceController.getMyConferences);
router.get('/:id', protect, conferenceController.getConferenceById);

// Faculty: Update/Resubmit rejected conference
router.put('/:id', protect, upload.fields([
    { name: 'certificate', maxCount: 1 },
    { name: 'proceedings', maxCount: 1 }
]), conferenceController.updateConference);

// HOD: Action
router.put('/hod-action/:id', protect, authorize(...primaryEvaluatorRoles), conferenceController.hodAction);

// R&D: Action
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), conferenceController.rndAction);

module.exports = router;
