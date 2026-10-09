const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const patentController = require('./Patent.controller');

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
const uploadDir = path.join(__dirname, '../../uploads/patents');
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
    limits: { fileSize: 200 * 1024 }, // Set to 200KB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only PDF files are allowed. Max size 200KB.'));
    }
});

// --- Routes ---

// Faculty: Submit and View own
router.post('/', protect, upload.fields([
    { name: 'eFilingReceipt', maxCount: 1 },
    { name: 'form1', maxCount: 1 }
]), patentController.createPatent);

router.get('/', protect, patentController.getMyPatents);
router.get('/:id', protect, patentController.getPatentById);

// Faculty: Update/Resubmit rejected patent
router.put('/:id', protect, upload.fields([
    { name: 'eFilingReceipt', maxCount: 1 },
    { name: 'form1', maxCount: 1 }
]), patentController.updatePatent);

// HOD: View pending and Action
router.get('/pending-hod', protect, authorize(...primaryEvaluatorRoles), patentController.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize(...primaryEvaluatorRoles), patentController.hodAction);

// R&D: View pending and Action
router.get('/pending-rnd', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), patentController.getPendingAtRND);
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), patentController.rndAction);

module.exports = router;
