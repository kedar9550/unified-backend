const FacultySubjectResult = require("./FacultySubjectResult.model");
const AcademicYear = require("../academicYear/academicYear.model");
const Semester = require("../semester/semester.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");

/**
 * Bulk insert from CSV
 * headers: facultyId, facultyName, academicYear, semester, subjectName, subjectCode, branch, appeared, passed, passPercentage
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
            "appeared",
            "passed",
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
                facultyid,       // institutional ID string e.g. FAC2024001
                facultyname,
                academicyear,
                semester,
                subjectname,
                subjectcode,
                branch,
                appeared,
                passed,
                passpercentage
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

            // 2. Resolve Semester - auto-calculate ODD/EVEN from semester number
            const semNo = Number(semester);
            if (isNaN(semNo)) {
                errors.push(`Row ${i + 2}: Invalid Semester number '${semester}' (must be a number).`);
                continue;
            }
            const calculatedSemType = semNo % 2 === 0 ? "EVEN" : "ODD";

            const semKey = `${ayId}_${calculatedSemType}`;
            let semId = semCache[semKey];
            if (!semId) {
                const sem = await Semester.findOneAndUpdate(
                    { academicYear: ayId, type: calculatedSemType },
                    { academicYear: ayId, type: calculatedSemType },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
                semId = sem._id;
                semCache[semKey] = semId;
            }

            // 2b. Validate Numerics (facultyId is a string — no Number conversion)
            const facId = (facultyid || "").trim();
            const app = Number(appeared);
            const pas = Number(passed);

            if (!facId) errors.push(`Row ${i + 2}: Faculty ID is missing.`);
            if (isNaN(app)) errors.push(`Row ${i + 2}: Invalid Appeared count '${appeared}' (must be a number).`);
            if (isNaN(pas)) errors.push(`Row ${i + 2}: Invalid Passed count '${passed}' (must be a number).`);

            if (!facId || isNaN(app) || isNaN(pas)) continue;

            // 3. Duplicate Prevention (facultyId string + subjectCode + semester number + ayId)
            const duplicate = await FacultySubjectResult.findOne({
                facultyId: facId,           // string comparison
                subjectCode: subjectcode,
                semester: semNo,
                academicYearId: ayId
            });

            if (duplicate) {
                errors.push(`Row ${i + 2}: Record already exists for Faculty ID ${facId} and Subject ${subjectcode}. Skipping.`);
                continue;
            }

            // 4. Calculate pass percentage
            const calculatedPercentage = app > 0 ? (pas / app) * 100 : 0;
            const finalPercentage = passpercentage ? Number(passpercentage) : calculatedPercentage;

            results.push({
                facultyId: facId,
                facultyName: facultyname,
                subjectName: subjectname,
                subjectCode: subjectcode,
                branch: branch,
                academicYearId: ayId,
                semesterId: semId,
                semester: semNo,
                semType: calculatedSemType,
                appeared: app,
                passed: pas,
                passPercentage: isNaN(finalPercentage) ? calculatedPercentage.toFixed(2) : finalPercentage.toFixed(2),
                uploadedBy: req.user.userId
            });
        }

        if (results.length > 0) {
            await FacultySubjectResult.insertMany(results);
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
 * Accepts either a human-readable string (e.g. "2024-2025", "ODD")
 * or a pre-existing ObjectId string (passes through as-is).
 */
const resolveAcademicIds = async ({ academicYear, semester }) => {
    let academicYearId = null;
    let semesterId = null;

    if (academicYear) {
        // If it looks like an ObjectId, use as-is; otherwise resolve by year string
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
 * Accepts: ?academicYear=2024-2025&semester=ODD
 */
const deleteSemesterData = async (req, res) => {
    try {
        const { academicYear, semester } = req.query;

        if (!academicYear || !semester) {
            return res.status(400).json({ message: "academicYear and semester are required" });
        }

        const { academicYearId, semesterId } = await resolveAcademicIds({ academicYear, semester });

        const result = await FacultySubjectResult.deleteMany({
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
 * Accepts: ?facultyId=123&academicYear=2024-2025&semester=ODD
 */
const getResults = async (req, res) => {
    try {
        const { facultyId, academicYear, semester } = req.query;
        const query = {};

        // facultyId is the institutional ID string (e.g. FAC2024001)
        if (facultyId) query.facultyId = facultyId.trim();

        if (academicYear || semester) {
            const { academicYearId, semesterId } = await resolveAcademicIds({ academicYear, semester });
            if (academicYearId) query.academicYearId = academicYearId;
            if (semesterId) query.semesterId = semesterId;
        }

        const results = await FacultySubjectResult.find(query)
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

        // Recalculate pass percentage if appeared or passed is updated
        if (updates.appeared !== undefined || updates.passed !== undefined) {
            const existing = await FacultySubjectResult.findById(id);
            if (!existing) return res.status(404).json({ message: "Record not found" });

            const app = updates.appeared !== undefined ? Number(updates.appeared) : existing.appeared;
            const pas = updates.passed !== undefined ? Number(updates.passed) : existing.passed;
            
            updates.passPercentage = app > 0 ? ((pas / app) * 100).toFixed(2) : 0;
        }

        const updatedRecord = await FacultySubjectResult.findByIdAndUpdate(
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
        const deleted = await FacultySubjectResult.findByIdAndDelete(id);

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
 * POST /api/faculty-subject-results
 */
const createResult = async (req, res) => {
    try {
        const {
            facultyId, facultyName, subjectName, subjectCode, branch,
            academicYearId, semesterId, appeared, passed
        } = req.body;

        if (!facultyId || !subjectName || !academicYearId || !semesterId) {
            return res.status(400).json({ message: "facultyId, subjectName, academicYearId, and semesterId are required." });
        }

        const app = Number(appeared) || 0;
        const pas = Number(passed) || 0;
        const passPercentage = app > 0 ? ((pas / app) * 100).toFixed(2) : 0;

        const record = await FacultySubjectResult.create({
            facultyId,
            facultyName,
            subjectName,
            subjectCode,
            branch,
            academicYearId,
            semesterId,
            appeared: app,
            passed: pas,
            passPercentage,
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
