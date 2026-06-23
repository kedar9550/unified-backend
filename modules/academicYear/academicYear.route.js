const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const {
    createAcademicYear,
    getAcademicYears,
    getActiveAcademicYear,
    toggleAcademicYear,
    toggleSemesterType,
    removeProgramFromYear,
    deleteAcademicYear,
    activateAcademicYear
} = require('./academicYear.controller');

// ── READ ──────────────────────────────────────────────────────────────
// Get all academic years (year-level docs with programs[] inside)
router.get('/', protect, getAcademicYears);

// Get active academic year for a specific program
router.get('/active', protect, getActiveAcademicYear);

// ── CREATE ────────────────────────────────────────────────────────────
// Bulk create (all programs) or add single program to a year
router.post('/', protect, authorize('UNIPRIME'), createAcademicYear);

// ── UPDATE ────────────────────────────────────────────────────────────
// Globally activate an academic year
router.put('/:id/activate', protect, authorize('UNIPRIME'), activateAcademicYear);

// Toggle isActive for one program inside a year
// Body: { isActive: bool, programId }
router.put('/:id/toggle-status', protect, authorize('UNIPRIME'), toggleAcademicYear);

// Toggle activeSemesterTypeId for one program inside a year
// Body: { semesterTypeId, programId }
router.put('/:id/semester-type', protect, authorize('UNIPRIME'), toggleSemesterType);

// ── DELETE ────────────────────────────────────────────────────────────
// Remove a single program from a year
router.delete('/:id/program/:programId', protect, authorize('UNIPRIME'), removeProgramFromYear);

// Delete the entire academic year document
router.delete('/:id', protect, authorize('UNIPRIME'), deleteAcademicYear);

module.exports = router;
