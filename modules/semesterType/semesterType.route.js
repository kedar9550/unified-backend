const express = require('express');
const router = express.Router();
const { seedSemesterTypes, getSemesterTypes, createSemesterType, toggleSemesterTypeStatus, deleteSemesterType } = require('./semesterType.controller');

router.post('/seed', seedSemesterTypes);
router.get('/', getSemesterTypes);
router.post('/', createSemesterType);
router.put('/:id/toggle', toggleSemesterTypeStatus);
router.delete('/:id', deleteSemesterType);

module.exports = router;
