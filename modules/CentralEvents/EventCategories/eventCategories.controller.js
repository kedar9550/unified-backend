const CentralEventCategory = require('./CentralEventCategory.model');
const CentralEventType = require('../EventTypes/CentralEventType.model');

// In-Memory Cache
const cachedCategoriesMap = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /central-event-types/:code/categories (cached)
 */
const getCategoriesByTypeCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const typeCodeUpper = code.toUpperCase();
    const now = Date.now();

    const cached = cachedCategoriesMap.get(typeCodeUpper);
    if (cached && (now - cached.time < CACHE_TTL_MS)) {
      return res.json({ success: true, data: cached.data });
    }

    const categories = await CentralEventCategory.find({
      typeCode: typeCodeUpper,
      isActive: true
    }).sort({ sortOrder: 1, name: 1 }).lean();

    cachedCategoriesMap.set(typeCodeUpper, { data: categories, time: now });

    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /central-event-categories/admin (Admin view including inactive)
 */
const getAllCentralEventCategoriesAdmin = async (req, res, next) => {
  try {
    const { typeCode } = req.query;
    const filter = {};
    if (typeCode) {
      filter.typeCode = typeCode.toUpperCase().trim();
    }

    const categories = await CentralEventCategory.find(filter)
      .populate('typeId', 'code name')
      .sort({ typeCode: 1, sortOrder: 1, name: 1 })
      .lean();

    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /central-event-categories
 */
const createCentralEventCategory = async (req, res, next) => {
  try {
    const { typeId, typeCode, code, name, hasSubcategories, subcategories, sortOrder, isActive, coordinator, coordinators, banner } = req.body;
    if ((!typeId && !typeCode) || !code || !name) {
      res.status(400);
      return next(new Error('Event type, Code, and Name are required'));
    }

    let typeObj = null;
    if (typeId) {
      typeObj = await CentralEventType.findById(typeId);
    } else if (typeCode) {
      typeObj = await CentralEventType.findOne({ code: typeCode.toUpperCase().trim() });
    }

    if (!typeObj) {
      res.status(400);
      return next(new Error('Invalid central event type selection'));
    }

    const coordsList = Array.isArray(coordinators) ? coordinators : (coordinator ? [coordinator] : []);

    const newCategory = new CentralEventCategory({
      typeId: typeObj._id,
      typeCode: typeObj.code,
      code: code.toUpperCase().trim(),
      name: name.trim(),
      hasSubcategories: !!hasSubcategories,
      subcategories: Array.isArray(subcategories) ? subcategories : [],
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      coordinator: coordsList[0] || coordinator || null,
      coordinators: coordsList,
      banner: banner || null
    });

    await newCategory.save();
    cachedCategoriesMap.delete(typeObj.code); // clear cache

    res.status(201).json({ success: true, data: newCategory });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400);
      return next(new Error(`Category code "${req.body.code}" already exists for this event type`));
    }
    next(error);
  }
};

/**
 * PUT /central-event-categories/:id
 */
const updateCentralEventCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, name, hasSubcategories, subcategories, sortOrder, isActive, coordinator, coordinators, banner } = req.body;

    const category = await CentralEventCategory.findById(id);
    if (!category) {
      res.status(404);
      return next(new Error('Category not found'));
    }

    if (code) category.code = code.toUpperCase().trim();
    if (name) category.name = name.trim();
    if (hasSubcategories !== undefined) category.hasSubcategories = !!hasSubcategories;
    if (subcategories !== undefined) category.subcategories = Array.isArray(subcategories) ? subcategories : [];
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (isActive !== undefined) category.isActive = isActive;
    if (coordinators !== undefined) {
      category.coordinators = Array.isArray(coordinators) ? coordinators : [];
      category.coordinator = category.coordinators[0] || null;
    } else if (coordinator !== undefined) {
      category.coordinator = coordinator;
    }
    if (banner !== undefined) category.banner = banner;

    await category.save();
    cachedCategoriesMap.delete(category.typeCode); // clear cache

    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /central-event-categories/:id
 */
const deleteCentralEventCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await CentralEventCategory.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404);
      return next(new Error('Category not found'));
    }

    cachedCategoriesMap.delete(deleted.typeCode); // clear cache
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCategoriesByTypeCode,
  getAllCentralEventCategoriesAdmin,
  createCentralEventCategory,
  updateCentralEventCategory,
  deleteCentralEventCategory
};
