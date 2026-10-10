const mongoose = require('mongoose');
const formRegistry = require('../../../config/form-registry.json');
const { computeFormCalculations } = require('../../../utils/calcEngine');

/**
 * Evaluates simple showIf condition string (e.g. "nature==='Other'", "level==='UG'")
 */
function evaluateShowIf(showIf, doc) {
  if (!showIf || typeof showIf !== 'string') return true;
  try {
    const eqIdx = showIf.indexOf('===');
    if (eqIdx !== -1) {
      const leftKey = showIf.slice(0, eqIdx).trim();
      const rightVal = showIf.slice(eqIdx + 3).trim().replace(/^['"]|['"]$/g, '');
      return String(doc[leftKey] || '') === rightVal;
    }
    const neqIdx = showIf.indexOf('!==');
    if (neqIdx !== -1) {
      const leftKey = showIf.slice(0, neqIdx).trim();
      const rightVal = showIf.slice(neqIdx + 3).trim().replace(/^['"]|['"]$/g, '');
      return String(doc[leftKey] || '') !== rightVal;
    }
  } catch (err) {
    console.error('Error evaluating showIf:', err);
  }
  return true;
}

class UniversityDataService {
  getFormsRegistry() {
    return formRegistry;
  }

  getFormByCode(code) {
    const form = formRegistry.forms.find((f) => f.code === code);
    if (!form) {
      const err = new Error(`Form with code '${code}' not found in registry`);
      err.statusCode = 404;
      throw err;
    }
    return form;
  }

  /**
   * Validates document payload against registry field definitions
   */
  validatePayload(form, payload) {
    const errors = [];
    const cleaned = {};
    const knownKeys = new Set(form.fields.map((f) => f.key));

    // Form 2.12 special keys
    if (form.code === '2.12') {
      knownKeys.add('student_names');
      knownKeys.add('roll_numbers');
    }

    // Fixed values for 2.20 and 2.21
    if (form.code === '2.20') payload.recipient_type = 'Faculty';
    if (form.code === '2.21') payload.recipient_type = 'Student';

    // Validate fields
    for (const field of form.fields) {
      const isVisible = evaluateShowIf(field.showIf, payload);
      if (!isVisible) continue;

      let val = payload[field.key];

      // Required check
      if (field.required && (val === undefined || val === null || val === '')) {
        errors.push({ field: field.key, message: `${field.label || field.key} is required` });
        continue;
      }

      if (val === undefined || val === null || val === '') continue;

      // Type conversion & validation
      if (field.type === 'number') {
        const num = Number(val);
        if (isNaN(num)) {
          errors.push({ field: field.key, message: `${field.label} must be a valid number` });
        } else {
          if (field.min !== undefined && num < field.min) {
            errors.push({ field: field.key, message: `${field.label} cannot be less than ${field.min}` });
          }
          if (field.max !== undefined && num > field.max) {
            errors.push({ field: field.key, message: `${field.label} cannot be greater than ${field.max}` });
          }
          cleaned[field.key] = num;
        }
      } else if (field.type === 'date') {
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          errors.push({ field: field.key, message: `${field.label} must be a valid date` });
        } else {
          cleaned[field.key] = d;
        }
      } else if (field.type === 'month') {
        if (!/^\d{4}-\d{2}$/.test(String(val))) {
          errors.push({ field: field.key, message: `${field.label} must be in YYYY-MM format` });
        } else {
          cleaned[field.key] = String(val);
        }
      } else if (field.type === 'select') {
        if (Array.isArray(field.options) && !field.options.includes(val)) {
          errors.push({ field: field.key, message: `Invalid option for ${field.label}` });
        } else {
          cleaned[field.key] = val;
        }
      } else if (field.type === 'rows') {
        if (!Array.isArray(val)) {
          errors.push({ field: field.key, message: `${field.label} must be an array of items` });
        } else {
          cleaned[field.key] = val;
        }
      } else {
        cleaned[field.key] = val;
      }
    }

    // Date range check
    if (cleaned.start_date && cleaned.end_date) {
      if (new Date(cleaned.end_date) < new Date(cleaned.start_date)) {
        errors.push({ field: 'end_date', message: 'End date cannot be earlier than start date' });
      }
    }

    // Academic year pattern check
    if (cleaned.academic_year && !/^\d{4}-\d{2}$/.test(String(cleaned.academic_year))) {
      errors.push({ field: 'academic_year', message: 'Academic year must be in format YYYY-YY (e.g. 2025-26)' });
    }

    if (errors.length > 0) {
      const err = new Error('Validation failed');
      err.statusCode = 400;
      err.errors = errors;
      throw err;
    }

    return cleaned;
  }

  /**
   * Prepares document for saving to database according to storage model
   */
  prepareStorageDocument(form, validatedPayload, user) {
    // 1. Recompute calculations
    const computed = computeFormCalculations(form.fields, validatedPayload);

    // 2. Audit fields
    const now = new Date();
    computed.updated_at = now;

    // Form 2.12 conversion: text fields -> students array
    if (form.code === '2.12') {
      const names = String(validatedPayload.student_names || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const rolls = String(validatedPayload.roll_numbers || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const studentsArr = [];
      const maxLen = Math.max(names.length, rolls.length);
      for (let i = 0; i < maxLen; i++) {
        studentsArr.push({
          name: names[i] || 'Unknown',
          roll_number: rolls[i] || '',
        });
      }
      computed.students = studentsArr.length > 0 ? studentsArr : [{ name: 'N/A', roll_number: '' }];
      delete computed.student_names;
      delete computed.roll_numbers;
    }

    // Activity forms storage mapping (central_event_academic_activities collection)
    const isActivity = form.storage === 'academic_activities' || form.collection === 'academic_activities' || form.storage === 'central_event_academic_activities' || form.collection === 'central_event_academic_activities';
    if (isActivity) {
      const extra = {};
      const document = {
        form_type: form.code,
        form_name: form.name,
        academic_year: computed.academic_year,
        department: computed.department,
        updated_at: now,
      };

      for (const field of form.fields) {
        if (field.section === 'extra') {
          if (computed[field.key] !== undefined) {
            extra[field.key] = computed[field.key];
          }
        } else {
          if (computed[field.key] !== undefined) {
            document[field.key] = computed[field.key];
          }
        }
      }

      document.extra = extra;

      // Build dedupe_key: form_type|academic_year|department|title|start_date|person
      const title = document.title || extra.course_name || extra.title || document.form_name || '';
      const startDateStr = document.start_date ? new Date(document.start_date).toISOString().slice(0, 10) : '';
      const person = document.faculty_name || document.resource_person || document.recipient_name || document.faculty_emp_id || '';
      document.dedupe_key = `${form.code}|${document.academic_year || ''}|${document.department || ''}|${title}|${startDateStr}|${person}`;

      return { isActivity, collectionName: 'central_event_academic_activities', document };
    }

    return { isActivity: false, collectionName: form.collection, document: computed };
  }

  /**
   * Transforms document fetched from DB back into form editing structure
   */
  transformDocumentForEdit(form, doc) {
    if (!doc) return null;
    const result = { ...doc, _id: doc._id.toString() };

    // Activity forms: merge extra properties back to top-level
    if (doc.extra && typeof doc.extra === 'object') {
      Object.assign(result, doc.extra);
      delete result.extra;
    }

    // Form 2.12: students array -> text fields student_names & roll_numbers
    if (form.code === '2.12' && Array.isArray(doc.students)) {
      result.student_names = doc.students.map((s) => s.name).join(', ');
      result.roll_numbers = doc.students.map((s) => s.roll_number).join(', ');
    }

    return result;
  }

  async createRecord(code, payload, user) {
    const form = this.getFormByCode(code);

    // Filter department permissions if user has department restriction
    if (user && user.department && payload.department && payload.department !== user.department) {
      if (!user.roles?.some((r) => ['ADMIN', 'IQAC', 'SUPER_ADMIN'].includes(r))) {
        const err = new Error(`Forbidden: You can only submit records for department '${user.department}'`);
        err.statusCode = 403;
        throw err;
      }
    }

    const validated = this.validatePayload(form, payload);
    const { collectionName, document } = this.prepareStorageDocument(form, validated, user);

    document.created_by = user?.userId || user?.emp_id || 'system';
    document.created_at = new Date();

    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);

    try {
      const result = await collection.insertOne(document);
      return { _id: result.insertedId, ...document };
    } catch (err) {
      if (err.code === 11000) {
        const duplicateFields = Object.keys(err.keyPattern || {}).join(', ');
        const error = new Error(`A duplicate record already exists with matching unique key (${duplicateFields || 'unique fields'})`);
        error.statusCode = 409;
        throw error;
      }
      throw err;
    }
  }

  async listRecords(code, query, user) {
    const form = this.getFormByCode(code);
    const isActivity = form.storage === 'academic_activities' || form.collection === 'academic_activities' || form.storage === 'central_event_academic_activities' || form.collection === 'central_event_academic_activities';
    const collectionName = isActivity ? 'central_event_academic_activities' : form.collection;

    const { academic_year, department, search, page = 1, limit = 20, sort = '-created_at' } = query;

    const filter = {};
    if (isActivity) {
      filter.form_type = code;
    }

    if (academic_year) filter.academic_year = academic_year;
    if (department) filter.department = department;

    // Apply department level security if department user
    if (user?.department && !user.roles?.some((r) => ['ADMIN', 'IQAC', 'SUPER_ADMIN'].includes(r))) {
      filter.department = user.department;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { title: searchRegex },
        { faculty_name: searchRegex },
        { student_name: searchRegex },
        { roll_number: searchRegex },
        { program: searchRegex },
        { organization: searchRegex },
        { company: searchRegex },
      ];
    }

    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const sortObj = {};
    if (sort) {
      const key = sort.startsWith('-') ? sort.slice(1) : sort;
      const dir = sort.startsWith('-') ? -1 : 1;
      sortObj[key] = dir;
    } else {
      sortObj.created_at = -1;
    }

    const total = await collection.countDocuments(filter);
    const rawDocs = await collection.find(filter).sort(sortObj).skip(skip).limit(limitNum).toArray();

    const docs = rawDocs.map((doc) => this.transformDocumentForEdit(form, doc));

    return {
      data: docs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  async getRecordById(code, id) {
    const form = this.getFormByCode(code);
    const isActivity = form.storage === 'academic_activities' || form.collection === 'academic_activities' || form.storage === 'central_event_academic_activities' || form.collection === 'central_event_academic_activities';
    const collectionName = isActivity ? 'central_event_academic_activities' : form.collection;

    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);

    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(id);
    } catch (err) {
      const error = new Error('Invalid record ID format');
      error.statusCode = 400;
      throw error;
    }

    const filter = { _id: objectId };
    if (isActivity) filter.form_type = code;

    const doc = await collection.findOne(filter);
    if (!doc) {
      const err = new Error(`Record with ID ${id} not found`);
      err.statusCode = 404;
      throw err;
    }

    return this.transformDocumentForEdit(form, doc);
  }

  async updateRecord(code, id, payload, user) {
    const form = this.getFormByCode(code);
    const existing = await this.getRecordById(code, id);

    const validated = this.validatePayload(form, payload);
    const { collectionName, document } = this.prepareStorageDocument(form, validated, user);

    delete document.created_at;
    delete document.created_by;

    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    const objectId = new mongoose.Types.ObjectId(id);

    try {
      await collection.updateOne({ _id: objectId }, { $set: document });
      return this.getRecordById(code, id);
    } catch (err) {
      if (err.code === 11000) {
        const duplicateFields = Object.keys(err.keyPattern || {}).join(', ');
        const error = new Error(`A duplicate record already exists with matching unique key (${duplicateFields || 'unique fields'})`);
        error.statusCode = 409;
        throw error;
      }
      throw err;
    }
  }

  async deleteRecord(code, id, user) {
    const form = this.getFormByCode(code);
    await this.getRecordById(code, id); // verifies existence

    const isActivity = form.storage === 'academic_activities' || form.collection === 'academic_activities' || form.storage === 'central_event_academic_activities' || form.collection === 'central_event_academic_activities';
    const collectionName = isActivity ? 'central_event_academic_activities' : form.collection;

    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    const objectId = new mongoose.Types.ObjectId(id);

    await collection.deleteOne({ _id: objectId });
    return { success: true, message: 'Record deleted successfully' };
  }

  async getFormTypes({ active_only, search } = {}) {
    const db = mongoose.connection.db;
    const coll = db.collection('form_types');

    // Fetch all records from DB to construct exact status map for all forms
    const dbFormTypes = await coll.find({}).sort({ code: 1 }).toArray();
    const dbStatusMap = new Map();
    const dbTypeMap = new Map();
    dbFormTypes.forEach(ft => {
      dbStatusMap.set(ft.code, ft.is_active);
      dbTypeMap.set(ft.code, ft);
    });

    const registryForms = formRegistry.forms.map(form => {
      const dbType = dbTypeMap.get(form.code);
      const isActiveInDb = dbStatusMap.has(form.code) ? dbStatusMap.get(form.code) : true;
      return {
        ...form,
        name: dbType?.name || form.name,
        group: dbType?.group || form.group,
        collection: dbType?.collection || form.collection,
        kind: dbType?.kind || (form.storage === 'academic_activities' || form.storage === 'central_event_academic_activities' ? 'activity' : 'separate'),
        is_active: isActiveInDb !== false,
      };
    });


    const registryCodes = new Set(registryForms.map(f => f.code));
    dbFormTypes.forEach(ft => {
      if (!registryCodes.has(ft.code)) {
        registryForms.push({
          code: ft.code,
          name: ft.name,
          group: ft.group || 'Custom Forms',
          collection: ft.collection,
          kind: ft.kind || 'separate',
          storage: ft.kind === 'activity' ? 'central_event_academic_activities' : 'flat document',
          fields: ft.fields || [
            { key: 'academic_year', label: 'Academic year', type: 'text', required: true },
            { key: 'department', label: 'Department', type: 'text', required: true },
            { key: 'title', label: 'Title / Name', type: 'text', required: true },
            { key: 'remarks', label: 'Remarks', type: 'textarea', required: false }
          ],
          is_active: ft.is_active !== false,
        });
      }
    });

    let result = registryForms;
    if (active_only === 'true' || active_only === true) {
      result = result.filter(f => f.is_active);
    }
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      result = result.filter(f => searchRegex.test(f.code) || searchRegex.test(f.name) || searchRegex.test(f.group));
    }

    return result;
  }

  async toggleFormTypeStatus(code) {
    const db = mongoose.connection.db;
    const coll = db.collection('form_types');

    const existing = await coll.findOne({ code });
    let newStatus = false;
    if (existing) {
      newStatus = !existing.is_active;
      await coll.updateOne({ code }, { $set: { is_active: newStatus, updated_at: new Date() } });
    } else {
      const form = formRegistry.forms.find(f => f.code === code);
      await coll.updateOne(
        { code },
        {
          $set: {
            code,
            name: form?.name || `Form ${code}`,
            group: form?.group || 'Custom Forms',
            collection: form?.collection || 'central_event_academic_activities',
            kind: (form?.storage === 'academic_activities' || form?.storage === 'central_event_academic_activities') ? 'activity' : 'separate',
            is_active: false,
            updated_at: new Date()
          }
        },
        { upsert: true }
      );
      newStatus = false;
    }

    return { code, is_active: newStatus };
  }

  async createFormType(payload) {
    const db = mongoose.connection.db;
    const coll = db.collection('form_types');

    const existing = await coll.findOne({ code: payload.code });
    if (existing) {
      const err = new Error(`Form type with code '${payload.code}' already exists`);
      err.statusCode = 409;
      throw err;
    }

    const doc = {
      code: payload.code,
      name: payload.name,
      group: payload.group || 'Custom Forms',
      collection: payload.collection || 'custom_form_data',
      kind: payload.kind || 'separate',
      is_active: payload.is_active !== false,
      created_at: new Date(),
    };

    await coll.insertOne(doc);
    return doc;
  }

  async updateFormType(code, payload) {
    const db = mongoose.connection.db;
    const coll = db.collection('form_types');

    const updateDoc = {
      name: payload.name,
      group: payload.group,
      collection: payload.collection,
      kind: payload.kind,
      is_active: payload.is_active !== false,
      updated_at: new Date(),
    };

    await coll.updateOne({ code }, { $set: updateDoc }, { upsert: true });
    return { code, ...updateDoc };
  }

  async deleteFormType(code) {
    const db = mongoose.connection.db;
    const coll = db.collection('form_types');

    await coll.deleteOne({ code });
    return { success: true, message: `Form type ${code} deleted successfully` };
  }
}

module.exports = new UniversityDataService();

