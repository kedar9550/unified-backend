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
        cb(null, `citations-bulk-${Date.now()}-${file.originalname}`);
    }
});
const uploadCsv = multer({ storage: csvStorage });

// Secure all endpoints under research deans, coordinators, and admins
router.use(protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR', 'ADMIN'));

router.get('/', authorCitationsController.getAuthorCitations);
router.post('/', authorCitationsController.addOrUpdateAuthorCitations);
router.post('/bulk', uploadCsv.single('file'), authorCitationsController.bulkUploadAuthorCitations);
router.delete('/:id', authorCitationsController.deleteAuthorCitations);

module.exports = router;
