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
    syncProfileWithECAP,
    bulkRegisterUser,
    bulkUpdateEmployees,
    adminUpdateEmployee,
    changePassword,
    getStaffData,
    getAllEmployees,
    getHODStaff,
    addHODStaff
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
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only JPG, JPEG, and PNG images are allowed. Max size 2MB.'));
    }
});

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
const uploadCsv = multer({ 
    storage: csvStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['.csv'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Only CSV files are allowed. Max size 5MB.'));
    }
});

// --- Auth & Onboarding ---
router.post('/register', registerUser);
router.post('/login', validateUser); 
router.post('/logout', protect, logoutUser);

// --- Profile & User Data ---
router.get('/me', protect, getMe);
router.put('/me/update', protect, updateProfile);
router.put('/me/change-password', protect, changePassword);
router.post('/me/profile-image', protect, upload.single('image'), profileImage);
router.post('/me/sync-ecap', protect, syncProfileWithECAP);

// --- Admin / Discovery ---
router.get('/', protect, getAllEmployees);
router.get('/hod/staff', protect, getHODStaff);
router.post('/hod/add-staff', protect, addHODStaff);
router.get('/search', protect, searchUser);
router.get('/staff/:id', protect, getStaffData);
router.post('/ecap-data', getecapdata);
router.post('/bulk-upload', protect, uploadCsv.single('file'), bulkRegisterUser);
router.put('/bulk-sync', protect, bulkUpdateEmployees);
router.put('/:id/admin-update', protect, adminUpdateEmployee);

module.exports = router;
