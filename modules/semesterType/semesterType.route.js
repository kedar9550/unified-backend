const express = require('express');
const router = express.Router();
const { seedSemesterTypes, getSemesterTypes } = require('./semesterType.controller');

router.post('/seed', seedSemesterTypes);
router.get('/', getSemesterTypes);

module.exports = router;
