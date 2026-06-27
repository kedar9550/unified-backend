const express = require("express");
const router = express.Router();
const multer = require("multer");
const { protect, authorize } = require("../../middlewares/authMiddleware");
const facultyProctoringController = require("./FacultyProctoringEntry.controller");

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

// Admin/Prime: Upload proctoring Excel data
router.post("/upload-excel", protect, authorize("ADMIN", "UNIPRIME"), upload.single("file"), facultyProctoringController.uploadExcel);

// Admin/Prime: Delete by academic year
router.delete("/clear", protect, authorize("ADMIN", "UNIPRIME"), facultyProctoringController.deleteSemesterData);

// Admin/Prime: View all proctoring entries
router.get("/all", protect, authorize("ADMIN", "UNIPRIME"), facultyProctoringController.getAllEntries);

// Faculty: View own proctoring data
router.get("/my-entries", protect, facultyProctoringController.getMyEntries);

// Single Entry CRUD
router.post("/", protect, authorize("ADMIN", "EXAMSECTION", "FACULTY", "UNIPRIME"), facultyProctoringController.createEntry);
router.put("/:id", protect, authorize("ADMIN", "EXAMSECTION", "FACULTY", "UNIPRIME"), facultyProctoringController.updateEntry);
router.delete("/:id", protect, authorize("ADMIN", "EXAMSECTION", "FACULTY", "UNIPRIME"), facultyProctoringController.deleteEntry);

module.exports = router;
