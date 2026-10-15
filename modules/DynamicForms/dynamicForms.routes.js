const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const dynamicFormsController = require('./dynamicForms.controller');
const { protect } = require('../../middlewares/authMiddleware');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/dynamic_forms');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage for uploaded files in forms
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitizedName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  }
});

// ==========================================
// ADMIN ROUTES (Mounted at /api/forms)
// ==========================================
const adminRouter = express.Router();
adminRouter.use(protect);

adminRouter.post('/', dynamicFormsController.createForm);
adminRouter.get('/', dynamicFormsController.getForms);
adminRouter.get('/:id', dynamicFormsController.getFormById);
adminRouter.put('/:id', dynamicFormsController.updateForm);
adminRouter.post('/:id/publish', dynamicFormsController.publishForm);
adminRouter.post('/:id/unpublish', dynamicFormsController.unpublishForm);
adminRouter.post('/:id/duplicate', dynamicFormsController.duplicateForm);
adminRouter.delete('/:id', dynamicFormsController.deleteForm);
adminRouter.get('/:id/submissions', dynamicFormsController.getSubmissions);
adminRouter.get('/:id/submissions/export', dynamicFormsController.exportSubmissions);

// ==========================================
// PUBLIC ROUTES (Mounted at /api/public/forms)
// ==========================================
const publicRouter = express.Router();

// File upload for form fields (e.g., student attachments, documents)
publicRouter.post('/upload', upload.single('file'), dynamicFormsController.uploadFile);

// Form definition & submission
publicRouter.get('/:slug', dynamicFormsController.getPublicFormBySlug);
publicRouter.post('/:slug/submissions', dynamicFormsController.submitPublicForm);

module.exports = {
  adminRouter,
  publicRouter
};
