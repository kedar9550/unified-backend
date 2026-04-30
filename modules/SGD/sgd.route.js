const express = require("express");
const router = express.Router();
const sgdController = require("../sgd.controller");

// Create SGD
router.post("/", sgdController.createSgd);

// Get All SGDs
router.get("/", sgdController.getAllSgds);

// Get Single SDG by ID
router.get("/:id", sgdController.getSgdById);

// Update SGD
router.put("/:id", sgdController.updateSgd);

// Delete SGD
router.delete("/:id", sgdController.deleteSgd);

module.exports = router;