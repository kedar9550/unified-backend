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

// Accept 'banner' field
const uploadImages = upload.fields([
    { name: 'banner', maxCount: 1 }
]);

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
