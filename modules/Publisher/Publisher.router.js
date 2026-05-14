const express = require('express');
const router = express.Router();
const publisherController = require('./Publisher.controller');

router.get('/', publisherController.getPublishers);

module.exports = router;
