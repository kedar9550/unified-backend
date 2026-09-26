const ServiceModuleBlock = require("./serviceModuleBlock.model");

// @desc   Get all blocks
// @route  GET /api/service-desk/blocks
// @access Any authenticated user (activeOnly query param for dropdowns)
exports.getBlocks = async (req, res, next) => {
  try {
    const { activeOnly } = req.query;
    const filter = activeOnly === "true" ? { status: "ACTIVE" } : {};
    const blocks = await ServiceModuleBlock.find(filter)
      .populate("createdBy", "name institutionId")
      .sort({ blockName: 1 })
      .lean();
    res.json({ success: true, data: blocks });
  } catch (error) {
    next(error);
  }
};

// @desc   Get block by ID
// @route  GET /api/service-desk/blocks/:id
// @access Authenticated user
exports.getBlockById = async (req, res, next) => {
  try {
    const block = await ServiceModuleBlock.findById(req.params.id)
      .populate("createdBy", "name institutionId")
      .lean();
    if (!block) {
      res.status(404);
      return next(new Error("Block not found"));
    }
    res.json({ success: true, data: block });
  } catch (error) {
    next(error);
  }
};

// @desc   Create new block
// @route  POST /api/service-desk/blocks
// @access PRIME
exports.createBlock = async (req, res, next) => {
  try {
    const { blockName, blockCode, description, status } = req.body;
    if (!blockName || !blockCode) {
      res.status(400);
      return next(new Error("Block Name and Block Code are required"));
    }

    const cleanCode = blockCode.trim().toUpperCase();
    const existingCode = await ServiceModuleBlock.findOne({ blockCode: cleanCode });
    if (existingCode) {
      res.status(400);
      return next(new Error(`Block with code "${cleanCode}" already exists`));
    }

    const block = await ServiceModuleBlock.create({
      blockName: blockName.trim(),
      blockCode: cleanCode,
      description: description || "",
      status: status || "ACTIVE",
      createdBy: req.user.userId
    });

    res.status(201).json({ success: true, message: "Block created successfully", data: block });
  } catch (error) {
    next(error);
  }
};

// @desc   Update block
// @route  PUT /api/service-desk/blocks/:id
// @access PRIME
exports.updateBlock = async (req, res, next) => {
  try {
    const { blockName, blockCode, description, status } = req.body;

    const block = await ServiceModuleBlock.findById(req.params.id);
    if (!block) {
      res.status(404);
      return next(new Error("Block not found"));
    }

    if (blockCode) {
      const cleanCode = blockCode.trim().toUpperCase();
      if (cleanCode !== block.blockCode) {
        const existing = await ServiceModuleBlock.findOne({ blockCode: cleanCode, _id: { $ne: block._id } });
        if (existing) {
          res.status(400);
          return next(new Error(`Block with code "${cleanCode}" already exists`));
        }
        block.blockCode = cleanCode;
      }
    }

    if (blockName) block.blockName = blockName.trim();
    if (description !== undefined) block.description = description;
    if (status) block.status = status;

    await block.save();

    res.json({ success: true, message: "Block updated successfully", data: block });
  } catch (error) {
    next(error);
  }
};

// @desc   Delete or toggle status of a block
// @route  DELETE /api/service-desk/blocks/:id
// @access PRIME
exports.deleteBlock = async (req, res, next) => {
  try {
    const block = await ServiceModuleBlock.findById(req.params.id);
    if (!block) {
      res.status(404);
      return next(new Error("Block not found"));
    }

    // Toggle status to INACTIVE or delete
    block.status = block.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await block.save();

    res.json({
      success: true,
      message: `Block status changed to ${block.status}`,
      data: block
    });
  } catch (error) {
    next(error);
  }
};
