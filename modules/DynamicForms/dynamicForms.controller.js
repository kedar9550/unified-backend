const DynamicForm = require('./dynamicForm.model');
const DynamicFormSubmission = require('./dynamicFormSubmission.model');
const validator = require('validator');
const path = require('path');
const fs = require('fs');

// Helper to sanitize slug
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Generate unique slug
async function ensureUniqueSlug(desiredSlug, currentId = null) {
  let slug = slugify(desiredSlug) || 'form-' + Math.floor(Math.random() * 10000);
  let candidate = slug;
  let counter = 1;

  while (true) {
    const query = { slug: candidate };
    if (currentId) {
      query._id = { $ne: currentId };
    }
    const exists = await DynamicForm.findOne(query);
    if (!exists) {
      return candidate;
    }
    candidate = `${slug}-${counter}`;
    counter++;
  }
}

class DynamicFormsController {
  // 1. Create a draft form
  async createForm(req, res, next) {
    try {
      const { title, description, slug, fields, sections, settings } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: 'Form title is required.' });
      }

      const desiredSlug = slug || title;
      const finalSlug = await ensureUniqueSlug(desiredSlug);

      const newForm = new DynamicForm({
        title: title.trim(),
        description: description || '',
        slug: finalSlug,
        fields: Array.isArray(fields) ? fields : [],
        sections: Array.isArray(sections) ? sections : [],
        settings: settings || {},
        status: 'draft',
        createdBy: req.user ? {
          userId: req.user.userId,
          name: req.user.name || req.user.username || 'Admin',
          empId: req.user.empId || req.user.employeeId || ''
        } : null
      });

      await newForm.save();

      return res.status(201).json({
        success: true,
        message: 'Form draft created successfully.',
        data: newForm
      });
    } catch (error) {
      next(error);
    }
  }

  // 2. List forms for admin
  async getForms(req, res, next) {
    try {
      const { search, status, page = 1, limit = 20 } = req.query;
      const query = {};

      if (status && status !== 'ALL') {
        query.status = status.toLowerCase();
      }

      if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [{ title: regex }, { slug: regex }, { description: regex }];
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const total = await DynamicForm.countDocuments(query);
      const forms = await DynamicForm.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      return res.status(200).json({
        success: true,
        data: forms,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // 3. Get single form by ID (for admin editor)
  async getFormById(req, res, next) {
    try {
      const { id } = req.params;
      const form = await DynamicForm.findById(id);

      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found.' });
      }

      return res.status(200).json({
        success: true,
        data: form
      });
    } catch (error) {
      next(error);
    }
  }

  // 4. Update form definition
  async updateForm(req, res, next) {
    try {
      const { id } = req.params;
      const { title, description, slug, fields, sections, settings, status } = req.body;

      const form = await DynamicForm.findById(id);
      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found.' });
      }

      if (title && title.trim()) {
        form.title = title.trim();
      }
      if (description !== undefined) {
        form.description = description;
      }

      if (slug && slug.trim() && slugify(slug) !== form.slug) {
        form.slug = await ensureUniqueSlug(slug, form._id);
      }

      if (Array.isArray(fields)) {
        form.fields = fields;
      }
      if (Array.isArray(sections)) {
        form.sections = sections;
      }
      if (settings && typeof settings === 'object') {
        form.settings = { ...form.settings.toObject(), ...settings };
      }
      if (status && ['draft', 'published', 'archived'].includes(status)) {
        form.status = status;
        if (status === 'published' && !form.publishedAt) {
          form.publishedAt = new Date();
        }
      }

      form.updatedBy = req.user ? {
        userId: req.user.userId,
        name: req.user.name || req.user.username || 'Admin'
      } : null;

      await form.save();

      return res.status(200).json({
        success: true,
        message: 'Form updated successfully.',
        data: form
      });
    } catch (error) {
      next(error);
    }
  }

  // 5. Publish form
  async publishForm(req, res, next) {
    try {
      const { id } = req.params;
      const form = await DynamicForm.findById(id);

      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found.' });
      }

      // Validation before publish: must have at least one field
      if (!form.fields || form.fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot publish an empty form. Please add at least one field.'
        });
      }

      form.status = 'published';
      form.publishedAt = new Date();
      form.updatedBy = req.user ? {
        userId: req.user.userId,
        name: req.user.name || 'Admin'
      } : null;

      await form.save();

      return res.status(200).json({
        success: true,
        message: 'Form published successfully!',
        data: {
          form,
          publicUrl: `/forms/${form.slug}`
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // 6. Unpublish form
  async unpublishForm(req, res, next) {
    try {
      const { id } = req.params;
      const form = await DynamicForm.findById(id);

      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found.' });
      }

      form.status = 'draft';
      await form.save();

      return res.status(200).json({
        success: true,
        message: 'Form unpublished successfully. Public submissions are now disabled.',
        data: form
      });
    } catch (error) {
      next(error);
    }
  }

  // 7. Duplicate form
  async duplicateForm(req, res, next) {
    try {
      const { id } = req.params;
      const source = await DynamicForm.findById(id);

      if (!source) {
        return res.status(404).json({ success: false, message: 'Source form not found.' });
      }

      const newTitle = `${source.title} (Copy)`;
      const newSlug = await ensureUniqueSlug(`${source.slug}-copy`);

      const clone = new DynamicForm({
        title: newTitle,
        description: source.description,
        slug: newSlug,
        fields: source.fields,
        sections: source.sections,
        settings: source.settings,
        status: 'draft',
        submissionCount: 0,
        createdBy: req.user ? {
          userId: req.user.userId,
          name: req.user.name || 'Admin'
        } : null
      });

      await clone.save();

      return res.status(201).json({
        success: true,
        message: 'Form duplicated successfully.',
        data: clone
      });
    } catch (error) {
      next(error);
    }
  }

  // 8. Delete form
  async deleteForm(req, res, next) {
    try {
      const { id } = req.params;
      const form = await DynamicForm.findByIdAndDelete(id);

      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found.' });
      }

      // Also delete associated submissions
      await DynamicFormSubmission.deleteMany({ formId: id });

      return res.status(200).json({
        success: true,
        message: 'Form and all its submissions deleted successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  // 9. Public: Get published form definition by slug
  async getPublicFormBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const form = await DynamicForm.findOne({ slug: slug.toLowerCase().trim() });

      if (!form) {
        return res.status(404).json({
          success: false,
          code: 'FORM_NOT_FOUND',
          message: 'The requested form does not exist.'
        });
      }

      if (form.status !== 'published') {
        return res.status(403).json({
          success: false,
          code: 'FORM_NOT_PUBLISHED',
          message: 'This form is currently not accepting submissions (Draft or Archived).'
        });
      }

      const now = new Date();
      if (form.settings?.startDate && now < new Date(form.settings.startDate)) {
        return res.status(403).json({
          success: false,
          code: 'FORM_NOT_STARTED',
          message: `This form is scheduled to open on ${new Date(form.settings.startDate).toLocaleDateString()}.`
        });
      }

      if (form.settings?.endDate && now > new Date(form.settings.endDate)) {
        return res.status(403).json({
          success: false,
          code: 'FORM_EXPIRED',
          message: 'This form has expired and is no longer accepting responses.'
        });
      }

      // Return public view of the form (exclude sensitive admin creator details)
      const publicForm = {
        id: form._id,
        title: form.title,
        description: form.description,
        slug: form.slug,
        fields: form.fields,
        sections: form.sections,
        settings: form.settings,
        publishedAt: form.publishedAt
      };

      return res.status(200).json({
        success: true,
        data: publicForm
      });
    } catch (error) {
      next(error);
    }
  }

  // 10. Public: Submit response to form
  async submitPublicForm(req, res, next) {
    try {
      const { slug } = req.params;
      const submittedData = req.body || {};

      const form = await DynamicForm.findOne({ slug: slug.toLowerCase().trim() });
      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found.' });
      }

      if (form.status !== 'published') {
        return res.status(403).json({ success: false, message: 'This form is not accepting responses.' });
      }

      const now = new Date();
      if (form.settings?.startDate && now < new Date(form.settings.startDate)) {
        return res.status(403).json({ success: false, message: 'This form has not started yet.' });
      }
      if (form.settings?.endDate && now > new Date(form.settings.endDate)) {
        return res.status(403).json({ success: false, message: 'This form has expired.' });
      }

      // Server-side validation against configured fields
      const errors = {};
      const sanitizedData = {};

      for (const field of form.fields) {
        // Skip structural components
        if (['heading', 'paragraph', 'divider'].includes(field.type)) {
          continue;
        }

        const val = submittedData[field.name];

        // Required check
        if (field.required) {
          if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
            errors[field.name] = `${field.label || field.name} is required.`;
            continue;
          }
        }

        if (val !== undefined && val !== null && val !== '') {
          // Type-specific validations
          if (field.type === 'email') {
            if (!validator.isEmail(String(val))) {
              errors[field.name] = 'Please enter a valid email address.';
            }
          } else if (field.type === 'number') {
            const num = Number(val);
            if (isNaN(num)) {
              errors[field.name] = 'Please enter a valid numeric value.';
            } else {
              if (field.min !== undefined && num < field.min) {
                errors[field.name] = `Value cannot be less than ${field.min}.`;
              }
              if (field.max !== undefined && num > field.max) {
                errors[field.name] = `Value cannot be greater than ${field.max}.`;
              }
            }
          } else if (field.type === 'phone') {
            const cleanPhone = String(val).replace(/[\s\-\(\)\+]/g, '');
            if (cleanPhone.length < 7 || cleanPhone.length > 15 || isNaN(Number(cleanPhone))) {
              errors[field.name] = 'Please enter a valid phone number.';
            }
          } else if (field.type === 'text' || field.type === 'textarea') {
            const strVal = String(val);
            if (field.minLength && strVal.length < field.minLength) {
              errors[field.name] = `Minimum length is ${field.minLength} characters.`;
            }
            if (field.maxLength && strVal.length > field.maxLength) {
              errors[field.name] = `Maximum length is ${field.maxLength} characters.`;
            }
          }

          // Custom regex validation rule if present
          if (field.validationRule && field.validationRule.trim()) {
            try {
              const regex = new RegExp(field.validationRule);
              if (!regex.test(String(val))) {
                errors[field.name] = field.errorMessage || 'Invalid input format.';
              }
            } catch (e) {
              console.error('Regex validation error on field:', field.name, e);
            }
          }

          sanitizedData[field.name] = val;
        }
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Please correct the highlighted validation errors.',
          errors
        });
      }

      // Save submission
      const submission = new DynamicFormSubmission({
        formId: form._id,
        formSlug: form.slug,
        submittedData: sanitizedData,
        ipAddress: req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      });

      await submission.save();

      // Increment submission count
      await DynamicForm.findByIdAndUpdate(form._id, { $inc: { submissionCount: 1 } });

      return res.status(201).json({
        success: true,
        message: form.settings?.successMessage || 'Form submitted successfully!',
        submissionId: submission._id
      });
    } catch (error) {
      next(error);
    }
  }

  // 11. Admin: Get all submissions for a form
  async getSubmissions(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50, search } = req.query;

      const form = await DynamicForm.findById(id);
      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found.' });
      }

      const query = { formId: form._id };

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const total = await DynamicFormSubmission.countDocuments(query);
      const submissions = await DynamicFormSubmission.find(query)
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      return res.status(200).json({
        success: true,
        form: {
          id: form._id,
          title: form.title,
          slug: form.slug,
          fields: form.fields
        },
        data: submissions,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // 12. Admin: Export submissions to CSV
  async exportSubmissions(req, res, next) {
    try {
      const { id } = req.params;
      const form = await DynamicForm.findById(id);
      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found.' });
      }

      const submissions = await DynamicFormSubmission.find({ formId: form._id })
        .sort({ submittedAt: -1 })
        .lean();

      // Collect headers from form fields
      const inputFields = (form.fields || []).filter(
        f => !['heading', 'paragraph', 'divider'].includes(f.type)
      );

      const headers = ['Submission ID', 'Submitted At', ...inputFields.map(f => `"${(f.label || f.name).replace(/"/g, '""')}"`)];
      const rows = [headers.join(',')];

      for (const sub of submissions) {
        const row = [
          sub._id.toString(),
          `"${new Date(sub.submittedAt).toLocaleString().replace(/"/g, '""')}"`
        ];

        for (const f of inputFields) {
          let val = sub.submittedData ? sub.submittedData[f.name] : '';
          if (Array.isArray(val)) {
            val = val.join('; ');
          } else if (val === null || val === undefined) {
            val = '';
          }
          row.push(`"${String(val).replace(/"/g, '""')}"`);
        }
        rows.push(row.join(','));
      }

      const csvContent = rows.join('\r\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="submissions_${form.slug}.csv"`);
      return res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  }

  // 13. File upload handler for file fields
  async uploadFile(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }

      // Return relative or full URL
      const relativePath = `/uploads/dynamic_forms/${req.file.filename}`;
      return res.status(200).json({
        success: true,
        url: relativePath,
        filename: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DynamicFormsController();
