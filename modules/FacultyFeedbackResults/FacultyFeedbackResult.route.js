const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
    uploadCSV,
    deleteSemesterData,
    getResults,
    updateResult,
    deleteResult,
    createResult
} = require("./FacultyFeedbackResult.controller");
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
 * @route   POST /api/faculty-feedback-results/upload
 * @desc    Upload CSV results (Bulk Insert)
 * @access  Private (Admin, Feedback Admin)
 */
router.post(
    "/upload",
    protect,
    authorize("ADMIN", "FEEDBACK COORDINATOR", "UNIVERSITY"),
    upload.single("file"),
    uploadCSV
);

/**
 * @route   POST /api/faculty-feedback-results
 * @desc    Create a single result record
 * @access  Private (Admin, Feedback Admin)
 */
router.post(
    "/",
    protect,
    authorize("ADMIN", "FEEDBACK COORDINATOR", "UNIVERSITY"),
    createResult
);

/**
 * @route   DELETE /api/faculty-feedback-results/semester
 * @desc    Delete all records for a semester
 * @access  Private (Admin, Feedback Admin)
 */
router.delete(
    "/semester",
    protect,
    authorize("ADMIN", "FEEDBACK COORDINATOR", "UNIVERSITY"),
    deleteSemesterData
);

/**
 * @route   GET /api/faculty-feedback-results
 * @desc    Get results with filters (facultyId, academicYearId, semesterId)
 * @access  Private (Protected)
 */
router.get(
    "/",
    protect,
    getResults
);

/**
 * @route   PUT /api/faculty-feedback-results/:id
 * @desc    Update a specific result record
 * @access  Private (Admin, Feedback Admin)
 */
router.put(
    "/:id",
    protect,
    authorize("ADMIN", "FEEDBACK COORDINATOR", "UNIVERSITY"),
    updateResult
);

/**
 * @route   DELETE /api/faculty-feedback-results/:id
 * @desc    Delete a specific record
 * @access  Private (Admin, Feedback Admin)
 */
router.delete(
    "/:id",
    protect,
    authorize("ADMIN", "FEEDBACK COORDINATOR", "UNIVERSITY"),
    deleteResult
);

module.exports = router;
