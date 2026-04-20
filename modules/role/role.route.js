const express = require('express');
const router = express.Router();
const {
    getRoles,
    createRole,
    updateRole,
    deleteRole,
    assignUserToRole,
    getRoleUsers,
    removeUserFromRole,
    getUserRoles,
    syncUserRoles,
    reconcileAllUserRoles
} = require('./role.controller');

router.route('/')
    .get(getRoles)
    .post(createRole);

router.route('/assign')
    .post(assignUserToRole);

router.route('/:id')
    .put(updateRole)
    .delete(deleteRole);

router.route('/:id/users')
    .get(getRoleUsers);

router.route('/reconcile-all')
    .post(reconcileAllUserRoles);

router.route('/user/sync')
    .post(syncUserRoles);

router.route('/user/:userId')
    .get(getUserRoles);

module.exports = router;
