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
    evaluateRNDAppraisal,
    updateProctoringDuties,
    getScopusData,
    getAllAppraisals,
    getAppraisalById,
    getActiveAppraisalYear,
    getMyAppraisals,
    generateAppraisalPDF,
    getPendingManagementAppraisals,
    evaluateManagementAppraisal
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
router.get("/active-year", protect, getActiveAppraisalYear);
router.get("/config/:academicYearId", protect, getAppraisalConfig);
router.post("/config", protect, authorize("ADMIN", "UNIPRIME"), saveAppraisalConfig);

// Faculty Self Appraisal actions
router.get("/my-appraisals", protect, authorize("FACULTY"), getMyAppraisals);
router.get("/initiate/:academicYearId", protect, authorize("FACULTY"), initiateOrGetAppraisal);
router.get("/unresolved-claims/:academicYearId", protect, authorize("FACULTY"), getUnresolvedClaims);
router.post("/resolve-claim", protect, authorize("FACULTY"), resolveClaim);
router.post("/claim-research", protect, authorize("FACULTY"), upload.single("undertaking"), claimResearchPublication);
router.post("/submit", protect, authorize("FACULTY"), submitAppraisal);
router.post("/proctoring-duties", protect, authorize("FACULTY"), updateProctoringDuties);

// Scopus citation & h-index fetch (calls Scopus API from backend, saves to appraisal)
router.get("/scopus-data/:academicYearId", protect, authorize("FACULTY", "ADMIN", "RESEARCH_DEAN", "RESEARCH_COORDINATOR", "DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN"), getScopusData);

// HOD and Dean Appraisal actions
router.get("/pending-hod", protect, authorize("DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN"), getPendingHODAppraisals);
router.put("/hod-evaluate/:id", protect, authorize(
    "DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN", 
    "VICE CHANCELLOR", "VICE_CHANCELLOR", 
    "DY. PRO CHANCELLOR", "DY_PRO_CHANCELLOR", 
    "REGISTRAR",
    "PRO VICE-CHANCELLOR (E & S)", "PRO_VICE_CHANCELLOR_E_S",
    "PRO VICE-CHANCELLOR (A)", "PRO_VICE_CHANCELLOR_A",
    "PRO VICE-CHANCELLOR (S & P)", "PRO_VICE_CHANCELLOR_S_P",
    "DEAN - (IQAC)", "DEAN_IQAC",
    "DEAN - (ADMISSIONS)", "DEAN_ADMISSIONS"
), evaluateHODAppraisal);

// Management Appraisal actions (Dean, Pro-VC, VC, Registrar, etc.)
router.get("/pending-management", protect, getPendingManagementAppraisals);
router.put("/management-evaluate/:id", protect, evaluateManagementAppraisal);

// R&D Admin Appraisal actions
router.get("/pending-rnd", protect, authorize("ADMIN", "RESEARCH_DEAN", "RESEARCH_COORDINATOR"), getPendingRNDAppraisals);
router.put("/rnd-evaluate/:id", protect, authorize("ADMIN", "RESEARCH_DEAN", "RESEARCH_COORDINATOR"), evaluateRNDAppraisal);

// All Appraisals (UNIPRIME)
router.get("/all/:academicYearId", protect, authorize("UNIPRIME"), getAllAppraisals);
router.get("/detail/:id", protect, authorize("UNIPRIME", "ADMIN", "PRINCIPAL", "DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN", "FACULTY"), getAppraisalById);

// PDF Generation
router.post("/generate-pdf", protect, authorize("UNIPRIME", "ADMIN", "PRINCIPAL", "DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN", "FACULTY"), generateAppraisalPDF);

module.exports = router;
