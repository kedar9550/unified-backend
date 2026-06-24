const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { protect, authorize } = require('../../middlewares/authMiddleware');
const jifController = require('./JournalImpactFactor.controller');

// Multer storage configuration for parsing uploaded CSV files
const csvStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `jif-csv-${Date.now()}-${file.originalname}`);
    }
});
const uploadCsv = multer({ storage: csvStorage });

// Secure all endpoints under research deans and coordinators
router.use(protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'));

router.get('/', jifController.getJournalImpactFactors);
router.post('/', jifController.addJournalImpactFactor);
router.put('/:id', jifController.updateJournalImpactFactor);
router.delete('/:id', jifController.deleteJournalImpactFactor);
router.post('/bulk', uploadCsv.single('file'), jifController.bulkUploadJournalImpactFactors);

module.exports = router;
