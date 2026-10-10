const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function getAcademicYearFolder(inputAy) {
  if (inputAy && typeof inputAy === 'string' && inputAy.trim()) {
    let raw = inputAy.trim();
    // Convert 2026-27 to 2026-2027 format
    if (/^\d{4}-\d{2}$/.test(raw)) {
      const parts = raw.split('-');
      const century = parts[0].substring(0, 2);
      return `${parts[0]}-${century}${parts[1]}`;
    }
    if (/^\d{4}-\d{4}$/.test(raw)) {
      return raw;
    }
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // Default to current academic year e.g. 2026-2027
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ay = getAcademicYearFolder(
      req.query.academicYear || req.query.academic_year || req.body?.academicYear || req.body?.academic_year || req.headers['x-academic-year']
    );

    let folderType = (
      req.query.folderType || req.query.folder_type || req.query.type ||
      req.body?.folderType || req.body?.folder_type || req.body?.type || 'events'
    ).toLowerCase().trim();

    if (!['category', 'subcategory', 'events'].includes(folderType)) {
      folderType = 'events';
    }

    const uploadPath = path.join(__dirname, `../../../uploads/central_events/${ay}/${folderType}`);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const nameWithoutExt = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${uuidv4().substring(0, 8)}-${nameWithoutExt}${ext}`);
  }
});

module.exports = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
