const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
    downloadTemplate,
    downloadYearTemplate,
    uploadCSV,
    uploadYearCSV,
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
 * @desc    Download CSV template for SEM programs (grade-based)
 * @access  Private
 */
router.get("/template", protect, downloadTemplate);

/**
 * @route   GET /api/student-results/template-year
 * @desc    Download CSV template for YEAR programs like Pharma.D (marks-based)
 * @access  Private
 */
router.get("/template-year", protect, downloadYearTemplate);

/**
 * @route   POST /api/student-results/upload
 * @desc    Upload SEM program results CSV (grade-based: B.Tech, M.Tech, MBA etc.)
 *          Required columns: studentid, subjectcode, subjectname, semester,
 *          examyear, resulttype, grade, subjecttype, sgpa, cgpa
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
 * @route   POST /api/student-results/upload-year
 * @desc    Upload YEAR program results CSV (marks-based: Pharma.D etc.)
 *          Required columns: studentid, subjectcode, subjectname, yearname,
 *          examyear, resulttype, subjecttype, intmarks, extmarks, totalmarks, maxmarks
 * @access  Private (ADMIN, EXAMSECTION, FACULTY)
 */
router.post(
    "/upload-year",
    protect,
    authorize("ADMIN", "EXAMSECTION", "FACULTY"),
    upload.single("file"),
    uploadYearCSV
);

/**
 * @route   GET /api/student-results/proctor-results
 * @desc    Fetch proctor mapped students pass percentage
 * @access  Private
 */
router.get("/proctor-results", protect, getProctorPassPercentage);

/**
 * @route   GET /api/student-results/proctor-departments
 * @desc    Fetch departments for proctor's mapped students
 * @access  Private
 */
router.get("/proctor-departments", protect, getProctorDepartments);

/**
 * @route   GET /api/student-results
 * @desc    Fetch results with optional filters
 *          Query: departmentId, semester, yearName, programId, branchId, examYear, resultType
 * @access  Private
 */
router.get("/", protect, getResults);

module.exports = router;
