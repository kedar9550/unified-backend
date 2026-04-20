const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const {
    uploadFeedback,
    getFeedback,
    deleteBatch,
    getTemplate
} = require('./feedback.controller');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

// Download blank CSV template
router.get('/template', getTemplate);

// Upload feedback CSV — FEEDBACK_COMMITTEE or SUPER_ADMIN only
router.post(
    '/upload',
    protect,
    authorize('FEEDBACK_COMMITTEE', 'SUPER_ADMIN'),
    upload.single('file'),
    uploadFeedback
);

// View feedback — all authenticated users (role filtering in controller)
router.get('/', protect, getFeedback);

// Delete a batch
router.delete(
    '/batch/:batchId',
    protect,
    authorize('FEEDBACK_COMMITTEE', 'SUPER_ADMIN'),
    deleteBatch
);

module.exports = router;
