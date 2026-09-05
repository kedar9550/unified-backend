const express = require('express');
const router = express.Router();
const eventStudentController = require('./EventStudent.controller');

router.post('/register', eventStudentController.registerStudent);
router.post('/login', eventStudentController.loginStudent);
router.put('/update', eventStudentController.updateStudent);

module.exports = router;

