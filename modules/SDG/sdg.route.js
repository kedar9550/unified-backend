const express = require("express");
const router = express.Router();
const sdgController = require("./Sdg.controller");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../../uploads/sdgs");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeName = `sdg-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, safeName);
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();
    if (ext === ".png" && mime === "image/png") {
        cb(null, true);
    } else {
        cb(new Error("Only PNG image format is allowed (.png)"), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 }, // Max 100 KB limit
    fileFilter
});

// Create SDG (supports image file upload)
router.post("/", upload.single("image"), sdgController.createSdg);

// Re-analyze background colors for all SDGs
router.post("/reanalyze-colors", sdgController.reanalyzeAllSdgColors);

// Get All SDGs
router.get("/", sdgController.getAllSdgs);

// Get Single SDG by ID
router.get("/:id", sdgController.getSdgById);

// Update SDG (supports image file upload)
router.put("/:id", upload.single("image"), sdgController.updateSdg);

// Upload SDG Image specifically
router.post("/:id/image", upload.single("image"), sdgController.uploadSdgImage);

// Delete SDG
router.delete("/:id", sdgController.deleteSdg);

module.exports = router;