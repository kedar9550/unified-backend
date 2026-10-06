const CentralEvent = require('./CentralEvent.model');
const Organizer = require('./Organizer.model');
const CentralEventType = require('../EventTypes/CentralEventType.model');
const CentralEventCategory = require('../EventCategories/CentralEventCategory.model');
const mongoose = require('mongoose');

/**
 * Utility to generate unique slug
 */
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W_]+?/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * GET /organizers?scope=
 */
const getOrganizers = async (req, res, next) => {
  try {
    const { scope } = req.query;
    const filter = { isActive: true };
    if (scope) {
      filter.scope = scope.toUpperCase();
    }

    const organizers = await Organizer.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: organizers });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /central-events (Create DRAFT)
 */
const createCentralEvent = async (req, res, next) => {
  try {
    const {
      typeCode, categoryId, level, activityType, organizer,
      title, description, inAssociationWith, outcomes, rules,
      mode, venue, participation, fee, schedule, eligibility,
      coordinators, resourcePersons, capacity
    } = req.body;

    // 1. Fetch Event Type
    const typeObj = await CentralEventType.findOne({ code: typeCode.toUpperCase(), isActive: true });
    if (!typeObj) {
      res.status(400);
      return next(new Error(`Invalid central event type code: ${typeCode}`));
    }

    // 2. Server-side validation: Categories
    let catObj = null;
    if (typeObj.hasCategories) {
      if (!categoryId) {
        res.status(400);
        return next(new Error(`Category is required for event type ${typeObj.code}`));
      }
      catObj = await CentralEventCategory.findById(categoryId);
      if (!catObj || catObj.typeCode !== typeObj.code) {
        res.status(400);
        return next(new Error('Invalid category selection for this event type'));
      }
    } else {
      if (categoryId) {
        res.status(400);
        return next(new Error(`Category must be null for event type ${typeObj.code}`));
      }
    }

    // 3. Server-side validation: Levels, Activity Types, Organizer
    if (typeObj.hasLevels) {
      if (!level || !activityType || !organizer || !organizer.organizerId) {
        res.status(400);
        return next(new Error(`Level, activityType and organizer are required for event type ${typeObj.code}`));
      }
      if (!typeObj.allowedLevels.includes(level)) {
        res.status(400);
        return next(new Error(`Level ${level} is not allowed for event type ${typeObj.code}`));
      }
      if (level === 'STUDENT' && !['WORKSHOP', 'SEMINAR'].includes(activityType)) {
        res.status(400);
        return next(new Error(`STUDENT level allows only WORKSHOP or SEMINAR activity types`));
      }
      if (level === 'FACULTY' && !['WORKSHOP', 'SEMINAR', 'FDP', 'STTP'].includes(activityType)) {
        res.status(400);
        return next(new Error(`FACULTY level allows WORKSHOP, SEMINAR, FDP, or STTP activity types`));
      }

      const orgDoc = await Organizer.findById(organizer.organizerId);
      if (!orgDoc) {
        res.status(400);
        return next(new Error('Invalid organizer selected'));
      }
      organizer.scope = orgDoc.scope;
      organizer.name = orgDoc.name;
    } else {
      if (level || activityType || organizer) {
        res.status(400);
        return next(new Error(`Level, activityType and organizer must be null for event type ${typeObj.code}`));
      }
    }

    // 4. Validate Dates
    const fromDate = new Date(schedule.fromDate);
    const toDate = new Date(schedule.toDate);
    const regDeadline = new Date(schedule.regDeadline);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || isNaN(regDeadline.getTime())) {
      res.status(400);
      return next(new Error('Invalid dates provided in schedule'));
    }
    if (toDate < fromDate) {
      res.status(400);
      return next(new Error('toDate must be after or equal to fromDate'));
    }
    if (regDeadline > fromDate) {
      res.status(400);
      return next(new Error('regDeadline must be before or equal to fromDate'));
    }

    // 5. Validate Participation
    if (participation?.type === 'TEAM') {
      if (!participation.minTeamSize || !participation.maxTeamSize || participation.minTeamSize > participation.maxTeamSize) {
        res.status(400);
        return next(new Error('Invalid team size specification'));
      }
    }

    // 6. Generate Slug
    let baseSlug = slugify(title);
    let slug = baseSlug;
    let counter = 1;
    while (await CentralEvent.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    // 7. Create Central Event Document
    const newEvent = new CentralEvent({
      slug,
      typeId: typeObj._id,
      typeCode: typeObj.code,
      categoryId: catObj ? catObj._id : null,
      categoryName: catObj ? catObj.name : null,
      level: typeObj.hasLevels ? level : null,
      activityType: typeObj.hasLevels ? activityType : null,
      organizer: typeObj.hasLevels ? {
        organizerId: organizer.organizerId,
        scope: organizer.scope,
        name: organizer.name
      } : null,
      title,
      titleLower: title.toLowerCase(),
      description,
      inAssociationWith: inAssociationWith || [],
      outcomes: outcomes || [],
      rules: rules || [],
      mode: mode || 'OFFLINE',
      venue: venue || {},
      participation: participation || { type: 'SINGLE', minTeamSize: 1, maxTeamSize: 1 },
      fee: {
        amount: Math.max(0, parseInt(fee?.amount || 0, 10)),
        currency: fee?.currency || 'INR'
      },
      schedule: {
        fromDate,
        toDate,
        regDeadline
      },
      eligibility: eligibility || {},
      coordinators: coordinators || {},
      resourcePersons: resourcePersons || [],
      banner: req.body.banner || null,
      attachments: req.body.attachments || [],
      capacity: capacity || 100,
      registrationCount: 0,
      status: 'DRAFT',
      createdBy: req.user?.userId || null
    });

    await newEvent.save();

    res.status(201).json({ success: true, data: newEvent });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400);
      return next(new Error('An event with this title and schedule already exists.'));
    }
    next(error);
  }
};

/**
 * PUT /central-events/:id (Update event)
 */
const updateCentralEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await CentralEvent.findById(id);
    if (!event) {
      res.status(404);
      return next(new Error('Central event not found'));
    }

    if (event.status === 'CANCELLED') {
      res.status(400);
      return next(new Error('Cannot update a cancelled event'));
    }

    const updates = req.body;
    if (updates.title && updates.title !== event.title) {
      updates.titleLower = updates.title.toLowerCase();
    }
    if (updates.schedule) {
      const fromDate = new Date(updates.schedule.fromDate || event.schedule.fromDate);
      const toDate = new Date(updates.schedule.toDate || event.schedule.toDate);
      const regDeadline = new Date(updates.schedule.regDeadline || event.schedule.regDeadline);
      if (toDate < fromDate) {
        res.status(400);
        return next(new Error('toDate must be after or equal to fromDate'));
      }
      if (regDeadline > fromDate) {
        res.status(400);
        return next(new Error('regDeadline must be before or equal to fromDate'));
      }
      updates.schedule = { fromDate, toDate, regDeadline };
    }

    updates.updatedBy = req.user?.userId;

    const updated = await CentralEvent.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /central-events/:id/publish
 */
const publishCentralEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await CentralEvent.findById(id);
    if (!event) {
      res.status(404);
      return next(new Error('Central event not found'));
    }

    event.status = 'PUBLISHED';
    event.updatedBy = req.user?.userId;
    await event.save();

    res.json({ success: true, message: 'Event published successfully', data: event });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /central-events/:id/cancel
 */
const cancelCentralEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await CentralEvent.findById(id);
    if (!event) {
      res.status(404);
      return next(new Error('Central event not found'));
    }

    event.status = 'CANCELLED';
    event.updatedBy = req.user?.userId;
    await event.save();

    res.json({ success: true, message: 'Event cancelled successfully', data: event });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /central-events (Filtered list with cursor pagination and projection)
 */
const getCentralEvents = async (req, res, next) => {
  try {
    const {
      typeCode, categoryId, level, activityType, status, mode,
      fromDate, toDate, search, cursor, limit = 20
    } = req.query;

    const filter = {};
    if (typeCode) filter.typeCode = typeCode.toUpperCase();
    if (categoryId) filter.categoryId = new mongoose.Types.ObjectId(categoryId);
    if (level) filter.level = level.toUpperCase();
    if (activityType) filter.activityType = activityType.toUpperCase();
    if (status) {
      filter.status = status.toUpperCase();
    } else {
      filter.status = 'PUBLISHED'; // default to published for general list
    }
    if (mode) filter.mode = mode.toUpperCase();

    if (fromDate || toDate) {
      filter['schedule.fromDate'] = {};
      if (fromDate) filter['schedule.fromDate'].$gte = new Date(fromDate);
      if (toDate) filter['schedule.fromDate'].$lte = new Date(toDate);
    }

    if (search) {
      filter.$text = { $search: search };
    }

    // Cursor pagination on schedule.fromDate & _id
    if (cursor) {
      const [cursorDateStr, cursorId] = cursor.split('_');
      if (cursorDateStr && cursorId) {
        filter.$or = [
          { 'schedule.fromDate': { $gt: new Date(cursorDateStr) } },
          {
            'schedule.fromDate': new Date(cursorDateStr),
            _id: { $gt: new mongoose.Types.ObjectId(cursorId) }
          }
        ];
      }
    }

    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

    // Selective projection for list view
    const projection = {
      title: 1,
      slug: 1,
      typeCode: 1,
      categoryId: 1,
      categoryName: 1,
      level: 1,
      activityType: 1,
      organizer: 1,
      mode: 1,
      fee: 1,
      schedule: 1,
      banner: 1,
      status: 1,
      capacity: 1,
      registrationCount: 1,
      createdAt: 1
    };

    const events = await CentralEvent.find(filter)
      .select(projection)
      .sort({ 'schedule.fromDate': 1, _id: 1 })
      .limit(pageSize + 1)
      .lean();

    let nextCursor = null;
    if (events.length > pageSize) {
      const nextItem = events.pop();
      nextCursor = `${nextItem.schedule.fromDate.toISOString()}_${nextItem._id}`;
    }

    res.json({
      success: true,
      data: events,
      nextCursor
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /central-events/:slug (Full detail)
 */
const getCentralEventBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const event = await CentralEvent.findOne({ slug }).lean();
    if (!event) {
      res.status(404);
      return next(new Error('Central event not found'));
    }
    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /central-events/upload (File upload endpoint for banner & attachments)
 */
const uploadCentralEventFile = async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      return next(new Error('No file uploaded'));
    }

    const relativePath = `/uploads/central-events/${req.file.filename}`;
    res.json({
      success: true,
      data: {
        name: req.file.originalname,
        url: relativePath,
        key: req.file.filename,
        size: req.file.size,
        mime: req.file.mimetype
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganizers,
  createCentralEvent,
  updateCentralEvent,
  publishCentralEvent,
  cancelCentralEvent,
  getCentralEvents,
  getCentralEventBySlug,
  uploadCentralEventFile
};
