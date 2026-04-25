const express = require('express');
const router = express.Router();
const {
    getRoles,
    createRole,
    updateRole,
    deleteRole,
    assignEmployeeToRole,
    getRoleEmployees,
    removeEmployeeFromRole,
    getEmployeeRoles,
    syncEmployeeRoles,
    reconcileAllEmployeeRoles
} = require('./role.controller');

router.route('/')
    .get(getRoles)
    .post(createRole);

router.route('/assign')
    .post(assignEmployeeToRole);

router.route('/:id')
    .put(updateRole)
    .delete(deleteRole);

router.route('/:id/users')
    .get(getRoleEmployees);

router.route('/reconcile-all')
    .post(reconcileAllEmployeeRoles);

router.route('/user/sync')
    .post(syncEmployeeRoles);

router.route('/user/:userId')
    .get(getEmployeeRoles);

module.exports = router;
