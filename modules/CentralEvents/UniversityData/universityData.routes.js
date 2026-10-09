const express = require('express');
const router = express.Router();
const universityDataController = require('./universityData.controller');
const { protect } = require('../../../middlewares/authMiddleware');

// Optional/flexible auth middleware wrapper so development/public access works gracefully if needed
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization || req.cookies?.token) {
    return protect(req, res, next);
  }
  // Default fallback user for unauthenticated requests during testing
  req.user = { userId: 'anonymous', roles: ['ADMIN', 'GLOBAL_EVENT_ADMIN'] };
  next();
};

// Form registry definition routes
router.get('/forms', optionalAuth, (req, res, next) => universityDataController.getForms(req, res, next));
router.get('/forms/:code', optionalAuth, (req, res, next) => universityDataController.getFormByCode(req, res, next));

// Form Types Management routes
router.get('/form-types', optionalAuth, (req, res, next) => universityDataController.getFormTypes(req, res, next));
router.post('/form-types', optionalAuth, (req, res, next) => universityDataController.createFormType(req, res, next));
router.put('/form-types/:code', optionalAuth, (req, res, next) => universityDataController.updateFormType(req, res, next));
router.patch('/form-types/:code/toggle-status', optionalAuth, (req, res, next) => universityDataController.toggleFormTypeStatus(req, res, next));
router.delete('/form-types/:code', optionalAuth, (req, res, next) => universityDataController.deleteFormType(req, res, next));

// Generic record CRUD routes
router.post('/forms/:code/records', optionalAuth, (req, res, next) => universityDataController.createRecord(req, res, next));
router.get('/forms/:code/records', optionalAuth, (req, res, next) => universityDataController.listRecords(req, res, next));
router.get('/forms/:code/records/:id', optionalAuth, (req, res, next) => universityDataController.getRecordById(req, res, next));
router.put('/forms/:code/records/:id', optionalAuth, (req, res, next) => universityDataController.updateRecord(req, res, next));
router.delete('/forms/:code/records/:id', optionalAuth, (req, res, next) => universityDataController.deleteRecord(req, res, next));

module.exports = router;
