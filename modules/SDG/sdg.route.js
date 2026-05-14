const express = require("express");
const router = express.Router();
const sdgController = require("./Sdg.controller");

// Create SDG
router.post("/", sdgController.createSdg);

// Get All SDGs
router.get("/", sdgController.getAllSdgs);

// Get Single SDG by ID
router.get("/:id", sdgController.getSdgById);

// Update SDG
router.put("/:id", sdgController.updateSdg);

// Delete SDG
router.delete("/:id", sdgController.deleteSdg);

module.exports = router;