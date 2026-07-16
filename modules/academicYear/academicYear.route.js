const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const {
    getAcademicYears,
    getActiveAcademicYear
} = require('./academicYear.controller');

// ── READ ──────────────────────────────────────────────────────────────
// Get all academic years
router.get('/', protect, getAcademicYears);

// Get active academic year based on today's date
router.get('/active', protect, getActiveAcademicYear);

module.exports = router;
