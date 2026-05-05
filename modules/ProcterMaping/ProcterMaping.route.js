const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
    uploadCSV,
    getMappings,
    getStudentsForMapping,
    createMapping,
    updateMapping,
    deleteMapping
} = require("./ProcterMaping.controller");
const { protect, authorize } = require("../../middlewares/authMiddleware");

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ["text/csv", "application/vnd.ms-excel"];
        const extension = file.originalname.split('.').pop().toLowerCase();
        if (allowedMimeTypes.includes(file.mimetype) || extension === "csv") {
            cb(null, true);
        } else {
            cb(new Error("Only CSV files are allowed."), false);
        }
    }
});

// Write operations restricted to HOD and ADMIN
router.post(
    "/upload",
    protect,
    authorize("ADMIN", "HOD", "FACULTY"), // Added FACULTY as well if they are HODs, but HOD is the primary
    upload.single("file"),
    uploadCSV
);

router.post(
    "/",
    protect,
    authorize("ADMIN", "HOD"),
    createMapping
);


router.put(
    "/:id",
    protect,
    authorize("ADMIN", "HOD"),
    updateMapping
);

router.delete(
    "/:id",
    protect,
    authorize("ADMIN", "HOD"),
    deleteMapping
);

// Read operations
router.get("/", protect, getMappings);
router.get("/students", protect, getStudentsForMapping);

module.exports = router;
