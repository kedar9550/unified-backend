const FacultyFeedResult = require("./FacultyFeedResult.model");
const AcademicYear = require("../academicYear/academicYear.model");
const Semester = require("../semester/semester.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");

/**
 * Bulk insert from CSV
 * headers: facultyId, facultyName, academicYear, semester, subjectName, subjectCode, branch, section, totalStudents, givenStudents, percentage, overallPercentage
 */
const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = [
            "facultyid",
            "facultyname",
            "academicyear",
            "semester",
            "subjectname",
            "subjectcode",
            "branch",
            "section",
            "totalstudents",
            "givenstudents",
            "percentage",
            "overallpercentage"
        ];

        validateHeaders(rows, requiredHeaders);

        const results = [];
        const errors = [];

        // Cache for academic years and semesters to avoid multiple queries
        const ayCache = {};
        const semCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const {
                facultyid,
                facultyname,
                academicyear,
                semester,
                subjectname,
                subjectcode,
                branch,
                section,
                totalstudents,
                givenstudents,
                percentage,
                overallpercentage
            } = row;

            // 1. Resolve Academic Year
            let ayId = ayCache[academicyear];
            if (!ayId) {
                const ay = await AcademicYear.findOne({ year: academicyear });
                if (!ay) {
                    errors.push(`Row ${i + 2}: Academic Year '${academicyear}' not found in the system.`);
                    continue;
                }
                ayId = ay._id;
                ayCache[academicyear] = ayId;
            }

            // 2. Resolve Semester - auto-create if not found for this academic year
            const semKey = `${ayId}_${semester.toUpperCase()}`;
            let semId = semCache[semKey];
            if (!semId) {
                const sem = await Semester.findOneAndUpdate(
                    { academicYear: ayId, type: semester.toUpperCase() },
                    { academicYear: ayId, type: semester.toUpperCase() },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
                semId = sem._id;
                semCache[semKey] = semId;
            }

            const facId = (facultyid || "").trim();
            const total = Number(totalstudents);
            const given = Number(givenstudents);
            const perc = Number(percentage);
            const overallPerc = Number(overallpercentage);

            if (!facId) errors.push(`Row ${i + 2}: Faculty ID is missing.`);
            if (isNaN(total)) errors.push(`Row ${i + 2}: Invalid totalStudents count '${totalstudents}' (must be a number).`);
            if (isNaN(given)) errors.push(`Row ${i + 2}: Invalid givenStudents count '${givenstudents}' (must be a number).`);
            if (isNaN(perc)) errors.push(`Row ${i + 2}: Invalid percentage '${percentage}' (must be a number).`);
            if (isNaN(overallPerc)) errors.push(`Row ${i + 2}: Invalid overallPercentage '${overallpercentage}' (must be a number).`);

            if (!facId || isNaN(total) || isNaN(given) || isNaN(perc) || isNaN(overallPerc)) continue;

            // 3. Duplicate Prevention
            const duplicate = await FacultyFeedResult.findOne({
                facultyId: facId,
                subjectCode: subjectcode,
                section: section,
                semesterId: semId,
                academicYearId: ayId
            });

            if (duplicate) {
                errors.push(`Row ${i + 2}: Record already exists for Faculty ID ${facId}, Subject ${subjectcode}, and Section ${section}. Skipping.`);
                continue;
            }

            results.push({
                facultyId: facId,
                facultyName: facultyname,
                subjectName: subjectname,
                subjectCode: subjectcode,
                branch: branch,
                section: section,
                academicYearId: ayId,
                semesterId: semId,
                totalStudents: total,
                givenStudents: given,
                percentage: perc,
                overallPercentage: overallPerc,
                uploadedBy: req.user.userId
            });
        }

        if (results.length > 0) {
            await FacultyFeedResult.insertMany(results);
        }

        if (results.length === 0 && errors.length > 0) {
            return res.status(400).json({
                message: "No records were uploaded. Please check the errors below.",
                errors: errors
            });
        }

        res.status(201).json({
            message: `Successfully uploaded ${results.length} records.`,
            processed: results.length,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        console.error("CSV Upload Error:", error);
        res.status(500).json({ message: error.message || "An error occurred during upload." });
    }
};

/**
 * Helper: Resolves academicYear string and semester type string to their ObjectIds.
 */
const resolveAcademicIds = async ({ academicYear, semester }) => {
    let academicYearId = null;
    let semesterId = null;

    if (academicYear) {
        const isObjectId = mongoose.Types.ObjectId.isValid(academicYear) && String(new mongoose.Types.ObjectId(academicYear)) === academicYear;
        if (isObjectId) {
            academicYearId = academicYear;
        } else {
            const ay = await AcademicYear.findOne({ year: academicYear });
            if (!ay) throw new Error(`Academic Year '${academicYear}' not found`);
            academicYearId = ay._id;
        }
    }

    if (academicYearId && semester) {
        const isObjectId = mongoose.Types.ObjectId.isValid(semester) && String(new mongoose.Types.ObjectId(semester)) === semester;
        if (isObjectId) {
            semesterId = semester;
        } else {
            const sem = await Semester.findOne({
                academicYear: academicYearId,
                type: semester.toUpperCase()
            });
            if (!sem) throw new Error(`Semester '${semester}' not found for Academic Year '${academicYear}'`);
            semesterId = sem._id;
        }
    }

    return { academicYearId, semesterId };
};

/**
 * Delete all records for a full semester
 */
const deleteSemesterData = async (req, res) => {
    try {
        const { academicYear, semester } = req.query;

        if (!academicYear || !semester) {
            return res.status(400).json({ message: "academicYear and semester are required" });
        }

        const { academicYearId, semesterId } = await resolveAcademicIds({ academicYear, semester });

        const result = await FacultyFeedResult.deleteMany({
            academicYearId,
            semesterId
        });

        res.json({
            message: `Deleted ${result.deletedCount} records for ${academicYear} - ${semester.toUpperCase()} semester.`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Get results — filtered by facultyId, academicYear string, semester type string
 */
const getResults = async (req, res) => {
    try {
        const { facultyId, academicYear, semester } = req.query;
        const query = {};

        if (facultyId) query.facultyId = facultyId.trim();

        if (academicYear || semester) {
            const { academicYearId, semesterId } = await resolveAcademicIds({ academicYear, semester });
            if (academicYearId) query.academicYearId = academicYearId;
            if (semesterId) query.semesterId = semesterId;
        }

        const results = await FacultyFeedResult.find(query)
            .populate("academicYearId", "year")
            .populate("semesterId", "type")
            .sort({ createdAt: -1 });

        res.json(results);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Update a particular record
 */
const updateResult = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const updatedRecord = await FacultyFeedResult.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updatedRecord) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json({
            message: "Record updated successfully",
            data: updatedRecord
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Delete a specific record
 */
const deleteResult = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await FacultyFeedResult.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json({ message: "Record deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Create a single result record
 */
const createResult = async (req, res) => {
    try {
        const {
            facultyId, facultyName, subjectName, subjectCode, branch, section,
            academicYearId, semesterId, totalStudents, givenStudents, percentage, overallPercentage
        } = req.body;

        if (!facultyId || !subjectName || !academicYearId || !semesterId) {
            return res.status(400).json({ message: "facultyId, subjectName, academicYearId, and semesterId are required." });
        }

        const record = await FacultyFeedResult.create({
            facultyId,
            facultyName,
            subjectName,
            subjectCode,
            branch,
            section,
            academicYearId,
            semesterId,
            totalStudents: Number(totalStudents) || 0,
            givenStudents: Number(givenStudents) || 0,
            percentage: Number(percentage) || 0,
            overallPercentage: Number(overallPercentage) || 0,
            uploadedBy: req.user.userId,
        });

        res.status(201).json({ message: "Record created successfully", data: record });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    uploadCSV,
    deleteSemesterData,
    getResults,
    updateResult,
    deleteResult,
    createResult
};
