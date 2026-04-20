const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('../../middlewares/authMiddleware');

const {
    registerUser,
    validateUser,
    changePassword,
    forgotPassword,
    verifyOtp,
    resetPasswordWithOtp,
    logoutUser,
    getMe,
    updateProfile,
    profileImage,
    searchUser,
    getecapdata,
    getActiveUsersCount,
    bulkRegisterUser
} = require('./user.controller');

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
const uploadCsv = multer({ 
    storage: csvStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "text/csv" || path.extname(file.originalname).toLowerCase() === ".csv") {
            cb(null, true);
        } else {
            cb(new Error("Only CSV files are allowed"), false);
        }
    }
});

// --- Auth & Onboarding ---
router.post('/register', registerUser);
router.post('/login', validateUser); // Enterprise login
router.post('/logout', protect, logoutUser);


// --- Password Recovery ---
router.post('/password/forgot', forgotPassword);
router.post('/password/verify-otp', verifyOtp);
router.post('/password/reset', resetPasswordWithOtp);
router.post('/password/change', protect, changePassword);

// --- Profile & User Data ---
router.get('/me', protect, getMe);
router.put('/me/update', protect, updateProfile);
router.post('/me/profile-image', protect, upload.single('image'), profileImage);

// --- Admin / Discovery ---
router.get('/search', protect, searchUser);
router.get('/active-count', protect, getActiveUsersCount);
router.post('/ecap-data', getecapdata);
router.post('/bulk-upload', protect, uploadCsv.single('file'), bulkRegisterUser);

module.exports = router;
