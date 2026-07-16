const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../../middlewares/authMiddleware');
const eventsController = require('./Events.controller');

// --- Multer Setup for Event Banners ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'events');
        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        // Extract and sanitize event name if it's available in the payload
        let evtName = req.body.eventName ? req.body.eventName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'event';
        cb(null, `event-${timestamp}-${evtName}${path.extname(file.originalname)}`);
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
router.post('/', protect, upload.single('bannerImage'), eventsController.createEvent);
router.get('/', protect, eventsController.getAllEvents);

module.exports = router;
