const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../../middlewares/authMiddleware');

const {
    registerUser,
    validateUser,
    logoutUser,
    getMe,
    updateProfile,
    profileImage,
    searchUser,
    getecapdata,
    bulkRegisterUser,
    bulkUpdateEmployees,
    adminUpdateEmployee,
    changePassword
} = require('./employee.controller');

// --- Multer Setup ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', '..', 'uploads', 'profile'));
    },
    filename: function (req, file, cb) {
        cb(null, req.user._id + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// CSV Upload Setup
const csvStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'csv');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, 'bulk-' + Date.now() + '.csv');
    }
});
const uploadCsv = multer({ storage: csvStorage });

// --- Auth & Onboarding ---
router.post('/register', registerUser);
router.post('/login', validateUser); 
router.post('/logout', protect, logoutUser);

// --- Profile & User Data ---
router.get('/me', protect, getMe);
router.put('/me/update', protect, updateProfile);
router.put('/me/change-password', protect, changePassword);
router.post('/me/profile-image', protect, upload.single('image'), profileImage);

// --- Admin / Discovery ---
router.get('/search', protect, searchUser);
router.post('/ecap-data', getecapdata);
router.post('/bulk-upload', protect, uploadCsv.single('file'), bulkRegisterUser);
router.put('/bulk-sync', protect, bulkUpdateEmployees);
router.put('/:id/admin-update', protect, adminUpdateEmployee);

module.exports = router;
