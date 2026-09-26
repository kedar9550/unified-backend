const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middlewares/authMiddleware");
const {
  getBlocks,
  getBlockById,
  createBlock,
  updateBlock,
  deleteBlock
} = require("./block.controller");

// All routes require authentication
router.use(protect);

// Read blocks (any authenticated user)
router.get("/", getBlocks);
router.get("/:id", getBlockById);

// Manage blocks (PRIME only)
router.post("/", authorize("UNIPRIME"), createBlock);
router.put("/:id", authorize("UNIPRIME"), updateBlock);
router.delete("/:id", authorize("UNIPRIME"), deleteBlock);

module.exports = router;
