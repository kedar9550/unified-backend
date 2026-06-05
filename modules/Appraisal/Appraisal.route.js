const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
    getAppraisalConfig,
    saveAppraisalConfig,
    initiateOrGetAppraisal,
    getUnresolvedClaims,
    resolveClaim,
    claimResearchPublication,
    submitAppraisal,
    getPendingHODAppraisals,
    evaluateHODAppraisal,
    getPendingRNDAppraisals,
    evaluateRNDAppraisal
} = require("./Appraisal.controller");

const { protect, authorize } = require("../../middlewares/authMiddleware");

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../../uploads/undertakings");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup for Undertaking file upload (PDF/Image)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `undertaking-${req.user.userId}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB Limit
    fileFilter: (req, file, cb) => {
        const allowedExts = [".pdf", ".jpg", ".jpeg", ".png"];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF and Images are allowed."));
        }
    }
});

// --- API Endpoints ---

// Dynamic configuration management
router.get("/config/:academicYearId", protect, getAppraisalConfig);
router.post("/config", protect, authorize("ADMIN", "UNIPRIME"), saveAppraisalConfig);

// Faculty Self Appraisal actions
router.get("/initiate/:academicYearId", protect, authorize("FACULTY"), initiateOrGetAppraisal);
router.get("/unresolved-claims/:academicYearId", protect, authorize("FACULTY"), getUnresolvedClaims);
router.post("/resolve-claim", protect, authorize("FACULTY"), resolveClaim);
router.post("/claim-research", protect, authorize("FACULTY"), upload.single("undertaking"), claimResearchPublication);
router.post("/submit", protect, authorize("FACULTY"), submitAppraisal);

// HOD Appraisal actions
router.get("/pending-hod", protect, authorize("DEPARTMENT HOD", "HOD"), getPendingHODAppraisals);
router.put("/hod-evaluate/:id", protect, authorize("DEPARTMENT HOD", "HOD"), evaluateHODAppraisal);

// R&D Admin Appraisal actions
router.get("/pending-rnd", protect, authorize("ADMIN", "RESEARCH_DEAN", "RESEARCH_COORDINATOR"), getPendingRNDAppraisals);
router.put("/rnd-evaluate/:id", protect, authorize("ADMIN", "RESEARCH_DEAN", "RESEARCH_COORDINATOR"), evaluateRNDAppraisal);

module.exports = router;
