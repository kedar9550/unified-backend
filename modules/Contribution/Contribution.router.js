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
    limits: { fileSize: 500 * 1024 }, // 500KB limit as per guidelines
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext) || file.mimetype === 'application/pdf') return cb(null, true);
        cb(new Error('Only PDF files are allowed. Max size 500KB.'));
    }
});

// --- Routes ---

// HOD Routes
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

router.get('/pending-hod', protect, authorize(...primaryEvaluatorRoles), controller.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize(...primaryEvaluatorRoles), controller.hodAction);
router.post('/hod-bulk-action', protect, authorize(...primaryEvaluatorRoles), controller.bulkHODAction);

// Faculty Routes
router.post('/', protect, upload.single('proof'), controller.createContribution);
router.post('/submit-academic-year', protect, controller.submitAcademicYear);
router.get('/', protect, controller.getMyContributions);
router.put('/:id', protect, upload.single('proof'), controller.updateContribution);
router.delete('/:id', protect, controller.deleteContribution);

module.exports = router;
