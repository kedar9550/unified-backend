const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// All Service Desk uploads live under unifiedbackend/uploads/service-desk/tickets/<ticketNumber>/
// This matches the convention used by every other module (uploads/patents,
// uploads/textbooks, etc.) — one shared uploads/ folder, static-served by
// app.js's `app.use('/uploads', express.static(...))`.

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads/service-desk/tickets", req.ticketNumber);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    cb(null, uuidv4() + "." + ext);
  }
});

module.exports = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB per file
});
