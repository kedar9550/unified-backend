const express = require("express");
const router = express.Router();
const multer = require("multer");
const controller = require("./Studentdata.controller");
const path = require("path");

// Configure Multer for temporary storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ];
    const allowedExtensions = [".csv", ".xlsx", ".xls"];
    const extension = path.extname(file.originalname).toLowerCase();

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(extension)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV and Excel files are allowed"), false);
    }
  }
});

// Routes
router.post("/add", controller.addStudent);
router.post("/sync", controller.syncStudentData);
router.post("/upload", upload.single("file"), controller.uploadStudentCSV);
router.post("/bulk-update", upload.single("file"), controller.bulkUpdateStudentCSV);
router.get("/unassigned", controller.getUnassignedStudents);
router.get("/assigned", controller.getAssignedStudents);
router.get("/filter-options", controller.getFilterOptions);
router.post("/assign", controller.assignStudents);
router.delete("/all/unassigned", controller.deleteAllUnassigned);
router.delete("/:rollNo", controller.deleteStudent);

module.exports = router;
