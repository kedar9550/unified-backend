const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const groupController = require('./Group.controller');

// ─── Multer storage: both logo & banner go to uploads/groups/ ─────────────────
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'groups');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const safeName  = (req.body.name || 'group')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase()
            .slice(0, 30);
        const field     = file.fieldname; // 'logo' or 'banner'
        cb(null, `group-${field}-${timestamp}-${safeName}${path.extname(file.originalname).toLowerCase()}`);
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

// Accept both 'logo' and 'banner' fields in a single request
const uploadGroupImages = upload.fields([
    { name: 'logo',   maxCount: 1 },
    { name: 'banner', maxCount: 1 }
]);

// ─── Routes ───────────────────────────────────────────────────────────────────
router.post(
    '/',
    protect,
    authorize('STUDENT EVENT ADMIN'),
    uploadGroupImages,
    groupController.createGroup
);

router.get('/', protect, groupController.getAllGroups);

router.get('/:id', protect, groupController.getGroupById);

router.put(
    '/:id',
    protect,
    authorize('STUDENT EVENT ADMIN'),
    uploadGroupImages,
    groupController.updateGroup
);

router.delete(
    '/:id',
    protect,
    authorize('STUDENT EVENT ADMIN'),
    groupController.deleteGroup
);

module.exports = router;
