const { v4: uuidv4 } = require('uuid');
const Employee = require('../employee/employee.model');
const Feedback = require('./feedback.model');
const AcademicYear = require('../academicYear/academicYear.model');
const { parseCSV, validateHeaders } = require('../../utils/csvParser');

const REQUIRED_HEADERS = [
    'faculty_id',       // institutionId of faculty
    'subject_name',
    'class_name',
    'rating',           // numeric 0-5
    'total_responses'
];

/* ===================================================
   UPLOAD FEEDBACK (FEEDBACK_COMMITTEE only)
   POST /api/feedback/upload?semesterTypeId=...&academicYearId=...
=================================================== */
const uploadFeedback = async (req, res) => {
    try {
        const { semesterTypeId, academicYearId } = req.query;

        if (!semesterTypeId || !academicYearId) {
            return res.status(400).json({
                message: 'semesterTypeId and academicYearId are required as query params'
            });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'CSV file is required' });
        }

        const academicYear = await AcademicYear.findById(academicYearId);
        if (!academicYear) return res.status(404).json({ message: 'Academic year not found' });

        let rows;
        try {
            rows = parseCSV(req.file.buffer);
            validateHeaders(rows, REQUIRED_HEADERS);
        } catch (parseErr) {
            return res.status(400).json({ message: parseErr.message });
        }

        const batchId = uuidv4();
        const errors = [];
        const toInsert = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            const faculty = await Employee.findOne({ institutionId: row.faculty_id });
            if (!faculty) {
                errors.push({ row: rowNum, error: `Faculty not found: ${row.faculty_id}` });
                continue;
            }

            const rating = parseFloat(row.rating);
            const totalResponses = parseInt(row.total_responses);

            if (isNaN(rating) || rating < 0 || rating > 5) {
                errors.push({ row: rowNum, error: 'rating must be a number between 0 and 5' });
                continue;
            }

            if (isNaN(totalResponses)) {
                errors.push({ row: rowNum, error: 'total_responses must be a number' });
                continue;
            }

            toInsert.push({
                faculty: faculty._id,
                facultyId: row.faculty_id,
                subjectName: row.subject_name,
                className: row.class_name,
                semesterTypeId: semesterTypeId,
                academicYear: academicYearId,
                rating,
                totalResponses,
                comments: row.comments || '',
                uploadedBy: req.user.userId,
                uploadBatch: batchId
            });
        }

        let inserted = [];
        if (toInsert.length > 0) {
            inserted = await Feedback.insertMany(toInsert);
        }

        return res.status(207).json({
            message: `Upload complete. ${inserted.length} records inserted, ${errors.length} skipped.`,
            batchId,
            inserted: inserted.length,
            skipped: errors.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (err) {
        console.error('Feedback Upload Error:', err);
        res.status(500).json({ message: err.message });
    }
};


/* ===================================================
   GET FEEDBACK
   GET /api/feedback?facultyId=&semesterId=&academicYearId=
=================================================== */
const getFeedback = async (req, res) => {
    try {
        const { facultyId, academicYearId, semesterTypeId } = req.query;
        const roles = req.user.roles?.map(r => r.role?.toUpperCase()) || [];

        const isAdmin = roles.some(r =>
            ['SUPER_ADMIN', 'FEEDBACK_COMMITTEE', 'ADMIN'].includes(r)
        );

        const filter = {};

        if (!isAdmin) {
            // Faculty sees only their own feedback
            filter.facultyId = req.user.institutionId || facultyId;
        } else if (facultyId) {
            filter.facultyId = facultyId;
        }

        if (semesterTypeId) filter.semesterTypeId = semesterTypeId;
        if (academicYearId) filter.academicYear = academicYearId;

        const feedback = await Feedback.find(filter)
            .populate('semesterTypeId', 'name')
            .populate('academicYear', 'year')
            .populate('faculty', 'name institutionId department designation')
            .populate('uploadedBy', 'name')
            .sort({ createdAt: -1 });

        res.json({ count: feedback.length, feedback });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


/* ===================================================
   DELETE BATCH
   DELETE /api/feedback/batch/:batchId
=================================================== */
const deleteBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const result = await Feedback.deleteMany({ uploadBatch: batchId });
        res.json({ message: `Deleted ${result.deletedCount} records`, batchId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


/* ===================================================
   GET CSV TEMPLATE
   GET /api/feedback/template
=================================================== */
const getTemplate = (req, res) => {
    const headers = [...REQUIRED_HEADERS, 'comments'].join(',');
    const sampleRow = 'EMP001,Mathematics,CSE-A,4.2,45,Great teaching methodology';

    const csv = `${headers}\n${sampleRow}\n`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="feedback_upload_template.csv"');
    res.send(csv);
};


module.exports = {
    uploadFeedback,
    getFeedback,
    deleteBatch,
    getTemplate
};
