const express = require('express');
const router = express.Router();
const controller = require('./ContributionCategory.controller');
const { protect } = require('../../middlewares/authMiddleware');

router.get('/', protect, controller.getCategories);

module.exports = router;
