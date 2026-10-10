const CentralEventType = require('./CentralEventType.model');

// In-Memory Cache
let cachedTypes = null;
let cachedTypesTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /central-event-types (cached)
 */
const getCentralEventTypes = async (req, res, next) => {
  try {
    const now = Date.now();
    if (cachedTypes && (now - cachedTypesTime < CACHE_TTL_MS)) {
      return res.json({ success: true, data: cachedTypes });
    }

    const types = await CentralEventType.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    cachedTypes = types;
    cachedTypesTime = now;

    res.json({ success: true, data: types });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /central-event-types/admin (Admin view)
 */
const getAllCentralEventTypesAdmin = async (req, res, next) => {
  try {
    const types = await CentralEventType.find().sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ success: true, data: types });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /central-event-types
 */
const createCentralEventType = async (req, res, next) => {
  try {
    const { code, name, hasCategories, hasLevels, levelGroup, allowedLevels, sortOrder, isActive, banner } = req.body;
    if (!code || !name) {
      res.status(400);
      return next(new Error('Code and Name are required'));
    }

    const newType = new CentralEventType({
      code: code.toUpperCase().trim(),
      name: name.trim(),
      hasCategories: !!hasCategories,
      hasLevels: !!hasLevels,
      levelGroup: levelGroup || 'GLOBAL',
      allowedLevels: allowedLevels || [],
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      banner: banner || null
    });

    await newType.save();
    cachedTypes = null; // Clear cache

    res.status(201).json({ success: true, data: newType });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400);
      return next(new Error(`Event type code "${req.body.code}" already exists`));
    }
    next(error);
  }
};

/**
 * PUT /central-event-types/:id
 */
const updateCentralEventType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, name, hasCategories, hasLevels, levelGroup, allowedLevels, sortOrder, isActive, banner } = req.body;

    const updates = {};
    if (code) updates.code = code.toUpperCase().trim();
    if (name) updates.name = name.trim();
    if (hasCategories !== undefined) updates.hasCategories = !!hasCategories;
    if (hasLevels !== undefined) updates.hasLevels = !!hasLevels;
    if (levelGroup) updates.levelGroup = levelGroup;
    if (allowedLevels) updates.allowedLevels = allowedLevels;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isActive !== undefined) updates.isActive = isActive;
    if (banner !== undefined) updates.banner = banner;

    const updated = await CentralEventType.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!updated) {
      res.status(404);
      return next(new Error('Event type not found'));
    }

    cachedTypes = null; // Clear cache
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /central-event-types/:id
 */
const deleteCentralEventType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await CentralEventType.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404);
      return next(new Error('Event type not found'));
    }

    cachedTypes = null; // Clear cache
    res.json({ success: true, message: 'Event type deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const clearTypesCache = () => {
  cachedTypes = null;
};

module.exports = {
  getCentralEventTypes,
  getAllCentralEventTypesAdmin,
  createCentralEventType,
  updateCentralEventType,
  deleteCentralEventType,
  clearTypesCache
};
