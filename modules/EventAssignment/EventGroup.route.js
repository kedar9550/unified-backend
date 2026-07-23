const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/authMiddleware');
const eventGroupController = require('./EventGroup.controller');

router.use(protect, authorize('CONVENER'));
router.get('/', eventGroupController.getGroups);
router.post('/', eventGroupController.createGroup);
router.put('/:id', eventGroupController.updateGroup);
router.delete('/:id', eventGroupController.deleteGroup);

module.exports = router;