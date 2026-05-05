const express = require('express');
const router = express.Router();
const academicsController = require('./academics.controller');
const { protect, authorize } = require('../../middlewares/authMiddleware');

// --- SCHOOL ROUTES ---
router.route('/schools')
    .get(protect, academicsController.getAllSchools)
    .post(protect, authorize('UNIPRIME'), academicsController.createSchool);

router.route('/schools/:id')
    .put(protect, authorize('UNIPRIME'), academicsController.updateSchool)
    .delete(protect, authorize('UNIPRIME'), academicsController.deleteSchool);

// --- DEPARTMENT ROUTES ---
router.route('/departments')
    .get(protect, academicsController.getAllDepartments)
    .post(protect, authorize('UNIPRIME'), academicsController.createDepartment);

router.route('/departments/:id')
    .put(protect, authorize('UNIPRIME'), academicsController.updateDepartment)
    .delete(protect, authorize('UNIPRIME'), academicsController.deleteDepartment);

// --- PROGRAM ROUTES ---
router.route('/programs')
    .get(protect, academicsController.getAllPrograms)
    .post(protect, authorize('UNIPRIME'), academicsController.createProgram);

router.route('/programs/:id')
    .put(protect, authorize('UNIPRIME'), academicsController.updateProgram)
    .delete(protect, authorize('UNIPRIME'), academicsController.deleteProgram);

// --- BRANCH ROUTES ---
router.route('/branches')
    .get(protect, academicsController.getAllBranches)
    .post(protect, authorize('UNIPRIME'), academicsController.createBranch);

router.route('/branches/:id')
    .put(protect, authorize('UNIPRIME'), academicsController.updateBranch)
    .delete(protect, authorize('UNIPRIME'), academicsController.deleteBranch);

module.exports = router;
