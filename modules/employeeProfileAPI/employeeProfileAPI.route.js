const express = require('express');
const router = express.Router();
const verifyApikey = require('./employeeProfileAPI.middleware');
const { getEmployeecompleteProfile } = require('./employeeProfileAPI.controller');

router.get('/:empID', verifyApikey, getEmployeecompleteProfile);

module.exports = router;