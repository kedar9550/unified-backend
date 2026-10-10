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
    const { typeCode, academicYear } = req.query;
    const filter = {};
    if (typeCode) {
      filter.typeCode = typeCode.toUpperCase().trim();
    }
    if (academicYear && academicYear !== 'ALL') {
      filter.$or = [
        { academicYear: academicYear.trim() },
        { academicYear: null },
        { academicYear: { $exists: false } }
      ];
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
    const { typeId, typeCode, code, name, academicYear, hasSubcategories, subcategories, sortOrder, isActive, coordinator, coordinators, banner } = req.body;
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
      academicYear: academicYear || null,
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
    const { code, name, academicYear, hasSubcategories, subcategories, sortOrder, isActive, coordinator, coordinators, banner } = req.body;

    const category = await CentralEventCategory.findById(id);
    if (!category) {
      res.status(404);
      return next(new Error('Category not found'));
    }

    if (code) category.code = code.toUpperCase().trim();
    if (name) category.name = name.trim();
    if (academicYear !== undefined) category.academicYear = academicYear;
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

/**
 * GET /central-event-subcategories/admin (Admin view of subcategories)
 */
const getAllCentralEventSubcategoriesAdmin = async (req, res, next) => {
  try {
    const { typeCode, academicYear, categoryId } = req.query;
    const filter = { hasSubcategories: true };

    if (typeCode) filter.typeCode = typeCode.toUpperCase().trim();
    if (categoryId) filter._id = categoryId;
    if (academicYear && academicYear !== 'ALL') {
      filter.$or = [
        { academicYear: academicYear.trim() },
        { academicYear: null },
        { academicYear: { $exists: false } }
      ];
    }

    const categories = await CentralEventCategory.find(filter)
      .populate('typeId', 'code name')
      .sort({ typeCode: 1, sortOrder: 1, name: 1 })
      .lean();

    const subcategoriesList = [];
    categories.forEach(cat => {
      (cat.subcategories || []).forEach(sub => {
        subcategoriesList.push({
          _id: sub._id || `${cat._id}_${sub.code}`,
          subId: sub._id,
          code: sub.code,
          name: sub.name,
          isActive: sub.isActive !== undefined ? sub.isActive : true,
          sortOrder: Number(sub.sortOrder || 0),
          banner: sub.banner || null,
          categoryId: cat._id,
          categoryCode: cat.code,
          categoryName: cat.name,
          typeCode: cat.typeCode,
          typeName: cat.typeId?.name || cat.typeCode,
          academicYear: cat.academicYear || ''
        });
      });
    });

    subcategoriesList.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));

    res.json({ success: true, data: subcategoriesList });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /central-event-subcategories
 */
const createCentralEventSubcategory = async (req, res, next) => {
  try {
    const { categoryId, code, name, isActive, sortOrder, banner } = req.body;
    if (!categoryId || !code || !name) {
      res.status(400);
      return next(new Error('Parent Category, Subcategory Code, and Name are required'));
    }

    const category = await CentralEventCategory.findById(categoryId);
    if (!category) {
      res.status(404);
      return next(new Error('Parent Category not found'));
    }

    if (!category.hasSubcategories) {
      res.status(400);
      return next(new Error(`Subcategories are not enabled for category "${category.name}"`));
    }

    const codeUpper = code.toUpperCase().trim();
    const existing = (category.subcategories || []).find(s => s.code === codeUpper);
    if (existing) {
      res.status(400);
      return next(new Error(`Subcategory code "${codeUpper}" already exists in this category`));
    }

    const newSubcat = {
      code: codeUpper,
      name: name.trim(),
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: Number(sortOrder) || 0,
      banner: banner || null
    };

    category.subcategories = category.subcategories || [];
    category.subcategories.push(newSubcat);
    await category.save();

    cachedCategoriesMap.delete(category.typeCode);

    const createdItem = category.subcategories[category.subcategories.length - 1];

    res.status(201).json({
      success: true,
      data: {
        _id: createdItem._id,
        code: createdItem.code,
        name: createdItem.name,
        isActive: createdItem.isActive,
        sortOrder: createdItem.sortOrder,
        banner: createdItem.banner,
        categoryId: category._id,
        categoryCode: category.code,
        categoryName: category.name,
        typeCode: category.typeCode,
        academicYear: category.academicYear
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /central-event-subcategories/:id
 */
const updateCentralEventSubcategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { categoryId, code, name, isActive, sortOrder, banner } = req.body;

    let category = null;
    if (categoryId) {
      category = await CentralEventCategory.findById(categoryId);
    }
    if (!category) {
      category = await CentralEventCategory.findOne({ 'subcategories._id': id });
    }

    if (!category) {
      res.status(404);
      return next(new Error('Parent Category / Subcategory not found'));
    }

    const subItem = category.subcategories.find(s => String(s._id) === String(id) || s.code === code?.toUpperCase()?.trim());
    if (!subItem) {
      res.status(404);
      return next(new Error('Subcategory not found'));
    }

    if (code) subItem.code = code.toUpperCase().trim();
    if (name) subItem.name = name.trim();
    if (isActive !== undefined) subItem.isActive = isActive;
    if (sortOrder !== undefined) subItem.sortOrder = Number(sortOrder) || 0;
    if (banner !== undefined) subItem.banner = banner;

    await category.save();
    cachedCategoriesMap.delete(category.typeCode);

    res.json({ success: true, data: subItem });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /central-event-subcategories/:id
 */
const deleteCentralEventSubcategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await CentralEventCategory.findOne({ 'subcategories._id': id });
    if (!category) {
      res.status(404);
      return next(new Error('Subcategory not found'));
    }

    category.subcategories = category.subcategories.filter(s => String(s._id) !== String(id));
    await category.save();
    cachedCategoriesMap.delete(category.typeCode);

    res.json({ success: true, message: 'Subcategory deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCategoriesByTypeCode,
  getAllCentralEventCategoriesAdmin,
  createCentralEventCategory,
  updateCentralEventCategory,
  deleteCentralEventCategory,
  getAllCentralEventSubcategoriesAdmin,
  createCentralEventSubcategory,
  updateCentralEventSubcategory,
  deleteCentralEventSubcategory
};
