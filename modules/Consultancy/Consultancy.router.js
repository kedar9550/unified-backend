const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const consultancyController = require('./Consultancy.controller');

const primaryEvaluatorRoles = [
    "DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN", 
    "VICE CHANCELLOR", "VICE_CHANCELLOR", 
    "DY. PRO CHANCELLOR", "DY_PRO_CHANCELLOR", 
    "REGISTRAR",
    "PRO VICE-CHANCELLOR (E & S)", "PRO_VICE_CHANCELLOR_E_S",
    "PRO VICE-CHANCELLOR (A)", "PRO_VICE_CHANCELLOR_A",
    "PRO VICE-CHANCELLOR (S & P)", "PRO_VICE_CHANCELLOR_S_P",
    "DEAN - (IQAC)", "DEAN_IQAC",
    "DEAN - (ADMISSIONS)", "DEAN_ADMISSIONS",
    "CONTROLLER OF EXAMINATIONS", "CONTROLLER_OF_EXAMINATIONS"
];

// Faculty: Submit and View own
router.post('/', protect, consultancyController.createConsultancy);
router.get('/', protect, consultancyController.getMyConsultancies);

// HOD: Action (must be before /:id)
router.put('/hod-action/:id', protect, authorize(...primaryEvaluatorRoles), consultancyController.hodAction);

// R&D: Action (must be before /:id)
router.put('/rnd-action/:id', protect, authorize('RESEARCH_DEAN', 'RESEARCH_COORDINATOR'), consultancyController.rndAction);

// Generic ID routes (must be AFTER specific named routes)
router.get('/:id', protect, consultancyController.getConsultancyById);

// Faculty: Update/Resubmit rejected consultancy
router.put('/:id', protect, consultancyController.updateConsultancy);

module.exports = router;
