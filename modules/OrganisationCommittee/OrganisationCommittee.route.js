const express = require('express');
const router = express.Router();
const {
    createCommitteeMember,
    getCommitteeMembers,
    updateCommitteeMember,
    deleteCommitteeMember
} = require('./OrganisationCommittee.controller');
const { protect } = require('../../middlewares/authMiddleware');

router
    .route('/')
    .post(protect, createCommitteeMember)
    .get(getCommitteeMembers);

router
    .route('/:id')
    .put(protect, updateCommitteeMember)
    .delete(protect, deleteCommitteeMember);

module.exports = router;
