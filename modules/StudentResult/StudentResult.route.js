const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
    downloadTemplate,
    uploadCSV,
    getResults,
    getProctorPassPercentage,
    getProctorDepartments
} = require("./StudentResult.controller");
const { protect, authorize } = require("../../middlewares/authMiddleware");

// ── Multer: memory storage for CSV buffer parsing ──
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            "text/csv",
            "application/vnd.ms-excel",
            "text/x-comma-separated-values",
            "text/comma-separated-values",
            "application/csv"
        ];
        const extension = file.originalname.split(".").pop().toLowerCase();

        if (allowedMimeTypes.includes(file.mimetype) || extension === "csv") {
            cb(null, true);
        } else {
            cb(new Error("Only CSV files are allowed. Your file type: " + file.mimetype), false);
        }
    }
});

/**
 * @route   GET /api/student-results/template
 * @desc    Download the CSV upload template
 * @access  Private
 */
router.get("/template", protect, downloadTemplate);

/**
 * @route   POST /api/student-results/upload
 * @desc    Upload Student Result CSV
 *          Body (multipart/form-data):
 *            file       → CSV file
 *            programId  → MongoId of selected Program
 *            examYear   → e.g. "2025"
 *            resultType → "REGULAR" | "SUPPLY"
 * @access  Private (ADMIN, EXAMSECTION, FACULTY)
 */
router.post(
    "/upload",
    protect,
    authorize("ADMIN", "EXAMSECTION", "FACULTY"),
    upload.single("file"),
    uploadCSV
);

/**
 * @route   GET /api/student-results/proctor-results
 * @desc    Fetch proctor mapped students pass percentage
 * @access  Private
 */
router.get("/proctor-results", protect, getProctorPassPercentage);
router.get("/proctor-departments", protect, getProctorDepartments);

/**
 * @route   GET /api/student-results
 * @desc    Fetch results with optional filters
 *          Query: academicYear, semester, programId, branchId
 * @access  Private
 */
router.get("/", protect, getResults);

module.exports = router;
