const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const authorCitationsController = require('./AuthorCitations.controller');

const csvStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${req.params.type || 'citations'}-bulk-${Date.now()}-${file.originalname}`);
    }
});
const uploadCsv = multer({ storage: csvStorage });

// My history (accessible to all logged-in users, e.g., faculty)
router.get('/me/:type', protect, authorCitationsController.getMyHistory);

// Secure all endpoints under research deans, coordinators, and admins
router.use(protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR', 'ADMIN'));

// :type must be 'citations' or 'hindex'
router.get('/:type', authorCitationsController.getList);
router.get('/:type/:empid', authorCitationsController.getHistory);
router.post('/:type', authorCitationsController.upsertYearValue);
router.post('/:type/bulk', uploadCsv.single('file'), authorCitationsController.bulkUpload);
router.delete('/:type/:empid/:year', authorCitationsController.deleteYearValue);

module.exports = router;
