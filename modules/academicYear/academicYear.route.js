const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const {
    createAcademicYear,
    getAcademicYears,
    toggleAcademicYear,
    updateAcademicYear,
    createSemester,
    getSemesters,
    toggleSemester
} = require('./academicYear.controller');

// Get all academic years — any authenticated user
router.get('/', protect, getAcademicYears);

// Create academic year — SUPER_ADMIN only
router.post('/', protect, authorize('UNIPRIME'), createAcademicYear);

// Update an academic year name — SUPER_ADMIN only
router.put('/:id', protect, authorize('UNIPRIME'), updateAcademicYear);

// Toggle active status of an academic year — SUPER_ADMIN only
router.put('/:id/toggle-status', protect, authorize('UNIPRIME'), toggleAcademicYear);

// Semester sub-routes
router.get('/:id/semesters', protect, getSemesters);
router.post('/:id/semesters', protect, authorize('UNIPRIME'), createSemester);
router.put('/:id/semesters/:semesterId/toggle-status', protect, authorize('UNIPRIME'), toggleSemester);

module.exports = router;
