const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const projectController = require('./FundedProject.controller');

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
const uploadDir = path.join(__dirname, '../../uploads/funded-projects');
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
        cb(new Error('Only PDF and image files are allowed. Max size 500KB.'));
    }
});

// --- Routes ---

// Faculty: Submit and View own
router.post('/', protect, upload.single('sanctionOrder'), projectController.createProject);

router.get('/', protect, projectController.getMyProjects);

// HOD: View pending and Action  (must be before /:id)
router.get('/pending-hod', protect, authorize(...primaryEvaluatorRoles), projectController.getPendingAtHOD);
router.put('/hod-action/:id', protect, authorize(...primaryEvaluatorRoles), projectController.hodAction);

// R&D: View pending and Action  (must be before /:id)
router.get('/pending-rnd', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), projectController.getPendingAtRND);
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), projectController.rndAction);

// Generic ID routes (must be AFTER specific named routes)
router.get('/:id', protect, projectController.getProjectById);

// Faculty: Update/Resubmit rejected project
router.put('/:id', protect, upload.single('sanctionOrder'), projectController.updateProject);

module.exports = router;
