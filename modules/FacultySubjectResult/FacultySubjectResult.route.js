const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
    uploadCSV,
    uploadUnifiedResults,
    deleteSemesterData,
    getResults,
    getCoAttainment,
    updateResult,
    deleteResult,
    createResult,
    getAvailableSemesters
} = require("./FacultySubjectResult.controller");
const { protect, authorize } = require("../../middlewares/authMiddleware");

// Multer setup - using memory storage for CSV buffer parsing
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ["text/csv", "application/vnd.ms-excel", "text/x-comma-separated-values", "text/comma-separated-values", "application/csv"];
        const extension = file.originalname.split('.').pop().toLowerCase();

        if (allowedMimeTypes.includes(file.mimetype) || extension === "csv") {
            cb(null, true);
        } else {
            cb(new Error("Only CSV files are allowed. Your file type: " + file.mimetype), false);
        }
    }
});

/**
 * @route   POST /api/faculty-subject-results/upload
 * @desc    Upload CSV results (Bulk Insert)
 * @access  Private (Admin, Exam Cell)
 */
router.post(
    "/upload",
    protect,
    authorize("ADMIN", "EXAMSECTION", "FACULTY"),
    upload.single("file"),
    uploadCSV
);

/**
 * @route   POST /api/faculty-subject-results/upload-results
 * @desc    Unified CSV results upload (Supports SEM/YEAR programs)
 * @access  Private (Admin, Exam Cell)
 */
router.post(
    "/upload-results",
    protect,
    authorize("ADMIN", "EXAMSECTION", "FACULTY"),
    upload.single("file"),
    uploadUnifiedResults
);

/**
 * @route   POST /api/faculty-subject-results
 * @desc    Create a single result record
 * @access  Private (Admin, Exam Cell)
 */
router.post(
    "/",
    protect,
    authorize("ADMIN", "EXAMSECTION"),
    createResult
);

/**
 * @route   DELETE /api/faculty-subject-results/semester
 * @desc    Delete all records for a semester
 * @access  Private (Admin, Exam Cell)
 */
router.delete(
    "/semester",
    protect,
    authorize("ADMIN", "EXAMSECTION"),
    deleteSemesterData
);

/**
 * @route   GET /api/faculty-subject-results/co-attainment
 * @desc    Get CO attainment data for a faculty (noOfCos, noOfCosAttained per course)
 * @access  Private (Protected)
 */
router.get(
    "/co-attainment",
    protect,
    getCoAttainment
);

/**
 * @route   GET /api/faculty-subject-results
 * @desc    Get results with filters (facultyId, academicYearId, semesterId)
 * @access  Private (Protected)
 */
router.get(
    "/",
    protect,
    getResults
);

/**
 * @route   GET /api/faculty-subject-results/available-semesters
 * @desc    Get unique semester numbers for a faculty
 * @access  Private (Protected)
 */
router.get(
    "/available-semesters",
    protect,
    getAvailableSemesters
);

/**
 * @route   PUT /api/faculty-subject-results/:id
 * @desc    Update a specific result record
 * @access  Private (Admin, Exam Cell)
 */
router.put(
    "/:id",
    protect,
    authorize("ADMIN", "EXAMSECTION"),
    updateResult
);

/**
 * @route   DELETE /api/faculty-subject-results/:id
 * @desc    Delete a specific record
 * @access  Private (Admin, Exam Cell)
 */
router.delete(
    "/:id",
    protect,
    authorize("ADMIN", "EXAMSECTION"),
    deleteResult
);

module.exports = router;

