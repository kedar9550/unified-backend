const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { protect, authorize } = require('../../middlewares/authMiddleware');
const jmController = require('./JournalMaster.controller');

// Multer storage for CSV uploads
const csvStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `csv-jm-${Date.now()}-${file.originalname}`);
    }
});
const uploadCsv = multer({ storage: csvStorage });

// Secure all endpoints under research deans and coordinators
router.use(protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'));

router.get('/', jmController.getJournalMasters);
router.post('/', jmController.addJournalMaster);
router.post('/bulk', uploadCsv.single('file'), jmController.bulkUploadJournalMasters);
router.put('/:id', jmController.updateJournalMaster);
router.delete('/:id', jmController.deleteJournalMaster);

module.exports = router;
