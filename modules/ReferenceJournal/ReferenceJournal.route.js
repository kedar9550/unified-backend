const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { protect, authorize } = require('../../middlewares/authMiddleware');
const refJournalController = require('./ReferenceJournal.controller');

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
        cb(null, `csv-${Date.now()}-${file.originalname}`);
    }
});
const uploadCsv = multer({ storage: csvStorage });

// Protect all routes: only RESEARCH_DEAN or RESEARCH_COORDINATOR can access reference databases
router.use(protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'));

router.get('/', refJournalController.getReferenceJournals);
router.post('/', refJournalController.addReferenceJournal);
router.put('/:id', refJournalController.updateReferenceJournal);
router.delete('/:id', refJournalController.deleteReferenceJournal);
router.post('/bulk', uploadCsv.single('file'), refJournalController.bulkUploadReferenceJournals);

module.exports = router;
