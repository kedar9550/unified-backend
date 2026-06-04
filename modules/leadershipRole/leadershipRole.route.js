const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const {
    assignLeadershipRole,
    removeLeadershipRole,
    getLeadershipRoles,
    getEmployeeLeadershipRoles
} = require('./LeadershipRole.controller');

// Secure all endpoints in this router so only UNIPRIME users can access them
router.use(protect);
router.use(authorize('UNIPRIME'));

router.route('/')
    .get(getLeadershipRoles)
    .post(assignLeadershipRole);

router.route('/:id')
    .delete(removeLeadershipRole);

router.route('/employee/:employeeId')
    .get(getEmployeeLeadershipRoles);

module.exports = router;
