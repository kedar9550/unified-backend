const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const consultancyController = require('./Consultancy.controller');

// Multer setup
const uploadDir = path.join(__dirname, '../../uploads/consultancy');
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
        const allowed = ['.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only PDF files are allowed.'));
    }
});

const cpUpload = upload.fields([
    { name: 'sanctionLetter', maxCount: 1 },
    { name: 'mou', maxCount: 1 }
]);

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

// Faculty: Submit and View own
router.post('/', protect, cpUpload, consultancyController.createConsultancy);
router.get('/', protect, consultancyController.getMyConsultancies);

// HOD: Action (must be before /:id)
router.put('/hod-action/:id', protect, authorize(...primaryEvaluatorRoles), consultancyController.hodAction);

// R&D: Action (must be before /:id)
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), consultancyController.rndAction);

// Generic ID routes (must be AFTER specific named routes)
router.get('/:id', protect, consultancyController.getConsultancyById);

// Faculty: Update/Resubmit rejected consultancy
router.put('/:id', protect, cpUpload, consultancyController.updateConsultancy);

module.exports = router;
