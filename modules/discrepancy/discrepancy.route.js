const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

const { protect } = require("../../middlewares/authMiddleware");
const {
    raiseDiscrepancy,
    getDiscrepancies,
    getDiscrepancyById,
    resolveDiscrepancy,
} = require("./discrepancy.controller");

// ── Multer — proof document upload ──────────────────────────────────
const uploadDir = path.join(__dirname, "../../uploads/discrepancies");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename:    (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `proof-${unique}${path.extname(file.originalname)}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error("Only PDF and image files are allowed for proof."));
    },
});

// ── Routes ───────────────────────────────────────────────────────────

// Faculty raises a discrepancy
router.post("/",    protect, raiseDiscrepancy);

// Get list — role-filtered
router.get("/",     protect, getDiscrepancies);

// Get single
router.get("/:id",  protect, getDiscrepancyById);

// Resolver team resolves — requires proof file upload
router.put("/:id",  protect, upload.single("proof"), resolveDiscrepancy);

module.exports = router;
