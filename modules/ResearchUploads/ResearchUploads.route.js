const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const { handleResearchUpload } = require('./ResearchUploads.controller');

// Ensure uploads go to the scripts/research_uploads directory to replace the target CSV
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../scripts/research_uploads'));
    },
    filename: function (req, file, cb) {
        // We overwrite the specific CSV file the script expects based on the category type
        const type = req.params.type;
        const validTypes = {
            'bookchapters': 'bookchapters.csv',
            'conferences': 'conferences.csv',
            'journals': 'journals.csv',
            'novelproducts': 'novelproducts.csv',
            'patents': 'patents.csv',
            'phdscholars': 'phdscholars.csv',
            'projects_consultancy': 'projects_consultancy.csv',
            'textbooks': 'textbooks.csv'
        };

        if (validTypes[type]) {
            cb(null, validTypes[type]);
        } else {
            cb(new Error("Invalid research category type"), false);
        }
    }
});

const upload = multer({ storage: storage });

// Define route
router.post('/:type', protect, authorize('UNIPRIME', 'ADMIN', 'RESEARCH_COORDINATOR', 'SERVICE_ADMIN'), upload.single('file'), handleResearchUpload);

module.exports = router;
