const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const clubController = require('./Club.controller');

// --- Multer Setup for Club Logos ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'clubs');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        let clubName = req.body.name ? req.body.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'club';
        cb(null, `club-${timestamp}-${clubName}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            return cb(null, true);
        }
        cb(new Error('Only JPG, JPEG, PNG, and WebP images are allowed. Max size 5MB.'));
    }
});

// --- Routes ---
router.post('/', protect, authorize('STUDENT EVENT ADMIN'), upload.single('logo'), clubController.createClub);
router.get('/', protect, clubController.getAllClubs);
router.get('/:id', protect, clubController.getClubById);
router.put('/:id', protect, authorize('STUDENT EVENT ADMIN'), upload.single('logo'), clubController.updateClub);
router.delete('/:id', protect, authorize('STUDENT EVENT ADMIN'), clubController.deleteClub);

module.exports = router;
