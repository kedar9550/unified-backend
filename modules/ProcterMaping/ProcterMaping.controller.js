const ProcterMaping = require("./ProcterMaping.model");
const AcademicYear = require("../academicYear/academicYear.model");
const Semester = require("../semester/semester.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");

/**
 * Bulk insert from CSV
 * headers: proctorId, proctorName, studentId, studentName, academicYear, semester
 */
const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = [
            "proctorid",
            "proctorname",
            "studentid",
            "studentname",
            "academicyear",
            "semester"
        ];

        validateHeaders(rows, requiredHeaders);

        const mappings = [];
        const errors = [];

        // Cache for academic years and semesters to avoid multiple queries
        const ayCache = {};
        const semCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const {
                proctorid,
                proctorname,
                studentid,
                studentname,
                academicyear,
                semester
            } = row;

            // 1. Resolve Academic Year
            let ayId = ayCache[academicyear];
            if (!ayId) {
                const ay = await AcademicYear.findOne({ year: academicyear });
                if (!ay) {
                    errors.push(`Row ${i + 2}: Academic Year '${academicyear}' not found.`);
                    continue;
                }
                ayId = ay._id;
                ayCache[academicyear] = ayId;
            }

            // 2. Resolve Semester
            const semKey = `${ayId}_${semester.toUpperCase()}`;
            let semId = semCache[semKey];
            if (!semId) {
                const sem = await Semester.findOne({
                    academicYear: ayId,
                    type: semester.toUpperCase()
                });
                if (!sem) {
                    errors.push(`Row ${i + 2}: Semester '${semester}' not found for year '${academicyear}'.`);
                    continue;
                }
                semId = sem._id;
                semCache[semKey] = semId;
            }

            const pId = (proctorid || "").trim();
            const sId = (studentid || "").trim();

            if (!pId || !sId) {
                errors.push(`Row ${i + 2}: Missing proctorId or studentId.`);
                continue;
            }

            // 3. Duplicate Prevention (studentId + semId + ayId)
            // A student can only have one proctor per semester
            const duplicate = await ProcterMaping.findOne({
                studentId: sId,
                semesterId: semId,
                academicYearId: ayId
            });

            if (duplicate) {
                if (duplicate.proctorId === pId) {
                    errors.push(`Row ${i + 2}: Assignment already exists (Student ${sId} -> Proctor ${pId}). Skipping.`);
                } else {
                    errors.push(`Row ${i + 2}: Student ${sId} is already assigned to another proctor (${duplicate.proctorId}). Skipping.`);
                }
                continue;
            }

            mappings.push({
                proctorId: pId,
                proctorName: proctorname,
                studentId: sId,
                studentName: studentname,
                academicYearId: ayId,
                semesterId: semId
            });
        }

        if (mappings.length > 0) {
            await ProcterMaping.insertMany(mappings);
        }

        res.status(201).json({
            message: `Successfully processed ${rows.length} rows. Uploaded ${mappings.length} mappings.`,
            processed: mappings.length,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        console.error("CSV Upload Error:", error);
        res.status(500).json({ message: error.message || "An error occurred during upload." });
    }
};

/**
 * Helper: Resolves active academicYear and semester if not provided
 */
const resolveActiveIds = async () => {
    const activeAy = await AcademicYear.findOne({ isActive: true });
    if (!activeAy) throw new Error("No active academic year found");

    const activeSem = await Semester.findOne({ academicYear: activeAy._id, isActive: true });
    if (!activeSem) throw new Error("No active semester found");

    return { academicYearId: activeAy._id, semesterId: activeSem._id };
};

/**
 * Helper: Resolve IDs from provided strings or fallback to active
 */
const resolveTargetIds = async (queryAy, querySem) => {
    if (queryAy && querySem) {
        let ayId, semId;

        const ay = await AcademicYear.findOne({ year: queryAy });
        if (!ay) throw new Error(`Academic Year '${queryAy}' not found`);
        ayId = ay._id;

        const sem = await Semester.findOne({ academicYear: ayId, type: querySem.toUpperCase() });
        if (!sem) throw new Error(`Semester '${querySem}' not found`);
        semId = sem._id;

        return { academicYearId: ayId, semesterId: semId };
    }
    return await resolveActiveIds();
};

/**
 * Get results with filters
 */
const getMappings = async (req, res) => {
    try {
        const { academicYear, semester, proctorId, studentId } = req.query;
        const query = {};

        if (proctorId) query.proctorId = proctorId.trim();
        if (studentId) query.studentId = studentId.trim();

        if (academicYear && semester) {
            const { academicYearId, semesterId } = await resolveTargetIds(academicYear, semester);
            query.academicYearId = academicYearId;
            query.semesterId = semesterId;
        } else if (!proctorId && !studentId) {
            // If no specific proctor/student search, default to active
            const { academicYearId, semesterId } = await resolveActiveIds();
            query.academicYearId = academicYearId;
            query.semesterId = semesterId;
        }

        const data = await ProcterMaping.find(query)
            .populate("academicYearId", "year")
            .populate("semesterId", "type")
            .sort({ studentId: 1 });

        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Update mapping
 */
const updateMapping = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await ProcterMaping.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated) return res.status(404).json({ message: "Record not found" });
        res.json({ message: "Updated successfully", data: updated });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Delete individual mapping
 */
const deleteMapping = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await ProcterMaping.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ message: "Record not found" });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Bulk delete by semester
 */
const deleteSemesterData = async (req, res) => {
    try {
        const { academicYear, semester } = req.query;
        if (!academicYear || !semester) {
            return res.status(400).json({ message: "academicYear and semester are required" });
        }
        const { academicYearId, semesterId } = await resolveTargetIds(academicYear, semester);
        const result = await ProcterMaping.deleteMany({ academicYearId, semesterId });
        res.json({ message: `Deleted ${result.deletedCount} mappings.`, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    uploadCSV,
    getMappings,
    updateMapping,
    deleteMapping,
    deleteSemesterData
};
