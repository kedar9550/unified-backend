const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const {
    createAcademicYear,
    getAcademicYears,
    getActiveAcademicYear,
    toggleAcademicYear,
    updateAcademicYear,
    toggleSemesterType,
    deleteAcademicYear
} = require('./academicYear.controller');

// Get all academic years — any authenticated user
router.get('/', protect, getAcademicYears);

// Get active academic year for a program — any authenticated user
router.get('/active', protect, getActiveAcademicYear);

// Create academic year — SUPER_ADMIN only
router.post('/', protect, authorize('UNIPRIME'), createAcademicYear);

// Update an academic year name — SUPER_ADMIN only
router.put('/:id', protect, authorize('UNIPRIME'), updateAcademicYear);

// Toggle active status of an academic year — SUPER_ADMIN only
router.put('/:id/toggle-status', protect, authorize('UNIPRIME'), toggleAcademicYear);

// Toggle active semester type for a year — SUPER_ADMIN only
router.put('/:id/semester-type', protect, authorize('UNIPRIME'), toggleSemesterType);

// Delete an academic year — SUPER_ADMIN only
router.delete('/:id', protect, authorize('UNIPRIME'), deleteAcademicYear);

module.exports = router;
