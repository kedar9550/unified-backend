const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const eventSchoolsController = require('./EventSchools.controller');

// Multer storage: banner goes to uploads/event_schools/
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'event_schools');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const safeName  = (req.body.name || 'eventschool')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase()
            .slice(0, 30);
        const field     = file.fieldname; // 'banner'
        cb(null, `eventschool-${field}-${timestamp}-${safeName}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext     = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
        return cb(null, true);
    }
    cb(new Error('Only JPG, JPEG, PNG, and WebP images are allowed. Max size 5MB.'));
};

const upload = multer({
    storage,
    limits:     { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
    fileFilter
});

// Accept 'banner' field with graceful error handling
const uploadImages = (req, res, next) => {
    upload.fields([{ name: 'banner', maxCount: 1 }])(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        message: 'Banner image exceeds the 5MB size limit. Please upload a smaller image under 5MB.'
                    });
                }
                if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                    return res.status(400).json({
                        success: false,
                        message: 'Unexpected file upload field encountered.'
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: `Image upload error: ${err.message}`
                });
            }
            return res.status(400).json({
                success: false,
                message: err.message || 'Invalid image file. Please upload JPG, PNG, or WebP under 5MB.'
            });
        }
        next();
    });
};

// Routes
router.post(
    '/',
    protect,
    authorize('STUDENT_EVENT_ADMIN'),
    uploadImages,
    eventSchoolsController.createEventSchool
);

router.get('/', eventSchoolsController.getAllEventSchools);

router.get('/:id', protect, eventSchoolsController.getEventSchoolById);

router.put(
    '/:id',
    protect,
    authorize('STUDENT_EVENT_ADMIN'),
    uploadImages,
    eventSchoolsController.updateEventSchool
);

router.delete(
    '/:id',
    protect,
    authorize('STUDENT_EVENT_ADMIN'),
    eventSchoolsController.deleteEventSchool
);

module.exports = router;
