const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const novelProductController = require('./NovelProduct.controller');

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

// Multer directory setup for Novel Product supporting documents
const uploadDir = path.join(__dirname, '../../uploads/novelProducts');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 }, // Set to 1MB, validate for 500KB in front-end/controller
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();

if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only PDF and image files are allowed. Max size 500KB.'));
    }
});

// --- Routes ---

// Faculty: Submit and View own history
router.post('/', protect, upload.single('document'), novelProductController.createNovelProduct);
router.get('/', protect, novelProductController.getMyNovelProducts);

// HOD: View pending and Action (must be before /:id)
router.get('/pending-hod', protect, authorize(...primaryEvaluatorRoles), novelProductController.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize(...primaryEvaluatorRoles), novelProductController.hodAction);

// R&D: View pending and Action (must be before /:id)
router.get('/pending-rnd', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), novelProductController.getPendingAtRND);
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), novelProductController.rndAction);

// Generic ID routes (must be AFTER specific named routes)
router.get('/:id', protect, novelProductController.getNovelProductById);

// Faculty: Update/Resubmit rejected product
router.put('/:id', protect, upload.single('document'), novelProductController.updateNovelProduct);

module.exports = router;
