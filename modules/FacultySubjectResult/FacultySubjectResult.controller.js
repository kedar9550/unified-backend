const FacultySubjectResult = require("./FacultySubjectResult.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const Employee = require("../employee/employee.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");
const ProcterMaping = require("../ProcterMaping/ProcterMaping.model");

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
            "academicyear",
            "semester",
            "branch",
            "appeared",
            "passed",
            "coursetype",
            "noofcos",
            "noofcosattained",
            "section"
        ];

        validateHeaders(rows, requiredHeaders);

        const results = [];
        const errors = [];

        // Cache for academic years and semester types to avoid multiple queries
        const ayCache = {};
        const semTypeCache = {};
        const facultyCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const {
                facultyid,
                facultyname,
                academicyear,
                semester,
                coursename,
                coursecode,
                coursetype,
                branch,
                appeared,
                passed,
                section,
                noofcos,
                noofcosattained,
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

            let semTypeId = semTypeCache[calculatedSemType];
            if (!semTypeId) {
                const st = await SemesterType.findOne({ name: calculatedSemType });
                if (!st) {
                    errors.push(`Row ${i + 2}: Global Semester Type '${calculatedSemType}' not found.`);
                    continue;
                }
                semTypeId = st._id;
                semTypeCache[calculatedSemType] = semTypeId;
            }

            // 2b. Validate Numerics (facultyId is a string — no Number conversion)
            const facId = (facultyid || "").trim();
            const app = Number(appeared);
            const pas = Number(passed);

            if (!facId) errors.push(`Row ${i + 2}: Faculty ID is missing.`);
            if (isNaN(app)) errors.push(`Row ${i + 2}: Invalid Appeared count '${appeared}' (must be a number).`);
            if (isNaN(pas)) errors.push(`Row ${i + 2}: Invalid Passed count '${passed}' (must be a number).`);

            if (!facId || isNaN(app) || isNaN(pas)) continue;

            // 2c. Fetch Faculty Name from Employee Database
            let resolvedFacultyName = facultyname || "";
            let emp = facultyCache[facId];
            if (!emp) {
                const employee = await Employee.findOne({ institutionId: facId, isActive: true });
                if (!employee) {
                    errors.push(`Row ${i + 2}: Faculty with ID '${facId}' not found or inactive.`);
                    continue;
                }
                emp = { name: employee.name };
                facultyCache[facId] = emp;
            }
            resolvedFacultyName = emp.name;

            // 3. Duplicate Prevention (facultyId string + courseCode + semester number + ayId)
            const duplicate = await FacultySubjectResult.findOne({
                facultyId: facId,
                courseCode: coursecode,
                semester: semNo,
                academicYearId: ayId
            });

            if (duplicate) {
                errors.push(`Row ${i + 2}: Record already exists for Faculty ID ${facId} and Subject ${coursecode}. Skipping.`);
                continue;
            }

            // 4. Calculate pass percentage
            const calculatedPercentage = app > 0 ? (pas / app) * 100 : 0;
            const finalPercentage = passpercentage ? Number(passpercentage) : calculatedPercentage;

            let finalCourseType = (coursetype || "").toUpperCase().trim();
            const cos = Number(noofcos);
            const cosAttained = Number(noofcosattained);
            const sec = (section || "").trim();

            //  Course Type
            if (!coursetype || coursetype.trim() === "") {
                errors.push(`Row ${i + 2}: Course Type is missing. Allowed: THEORY / PRACTICAL / INTEGRATED.`);
                continue;
            }

            if (!["THEORY", "PRACTICAL", "INTEGRATED"].includes(finalCourseType)) {
                errors.push(`Row ${i + 2}: Invalid Course Type '${coursetype}'.`);
                continue;
            }

            // noOfCos
            if (noofcos === undefined || noofcos === "") {
                errors.push(`Row ${i + 2}: noOfCos is missing.`);
                continue;
            }

            if (isNaN(cos) || cos < 0) {
                errors.push(`Row ${i + 2}: noOfCos must be a valid positive number.`);
                continue;
            }

            // noOfCosAttained
            if (noofcosattained === undefined || noofcosattained === "") {
                errors.push(`Row ${i + 2}: noOfCosAttained is missing.`);
                continue;
            }

            if (isNaN(cosAttained) || cosAttained < 0) {
                errors.push(`Row ${i + 2}: noOfCosAttained must be a valid positive number.`);
                continue;
            }

            // Logical Validation (VERY IMPORTANT )
            if (cosAttained > cos) {
                errors.push(`Row ${i + 2}: noOfCosAttained (${cosAttained}) cannot be greater than noOfCos (${cos}).`);
                continue;
            }

            // Section
            if (!sec) {
                errors.push(`Row ${i + 2}: Section is missing.`);
                continue;
            }

            results.push({
                facultyId: facId,
                facultyName: resolvedFacultyName,
                courseName: coursename,
                courseCode: coursecode,
                courseType: finalCourseType,
                branch: branch,
                academicYearId: ayId,
                semesterTypeId: semTypeId,
                semester: semNo,
                appeared: app,
                passed: pas,
                section: sec,
                noOfCos: cos,
                noOfCosAttained: cosAttained,
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
    let semesterTypeId = null;

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
            semesterTypeId = semester;
        } else {
            const st = await SemesterType.findOne({ name: semester.toUpperCase() });
            if (!st) throw new Error(`Semester Type '${semester}' not found`);
            semesterTypeId = st._id;
        }
    }

    return { academicYearId, semesterTypeId };
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

        const { academicYearId, semesterTypeId } = await resolveAcademicIds({ academicYear, semester });

        const result = await FacultySubjectResult.deleteMany({
            academicYearId,
            semesterTypeId
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
            const { academicYearId, semesterTypeId } = await resolveAcademicIds({ academicYear, semester });
            if (academicYearId) query.academicYearId = academicYearId;
            if (semesterTypeId) query.semesterTypeId = semesterTypeId;
        }

        const results = await FacultySubjectResult.find(query)
            .populate("academicYearId", "year")
            .populate("semesterTypeId", "name")
            .sort({ createdAt: -1 });

        // Flatten populated fields for frontend consumption
        const formatted = results.map((r) => {
            const obj = r.toObject();
            return {
                ...obj,
                academicYear: obj.academicYearId?.year || "",
                semesterType: obj.semesterTypeId?.name || "",
                // Alias for frontend compatibility
                subjectName: obj.courseName,
                subjectCode: obj.courseCode,
            };
        });

        res.json(formatted);
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
            facultyId, facultyName, courseName, courseCode, courseType, branch,
            academicYearId, semesterTypeId, semester, section,
            noOfCos, noOfCosAttained, appeared, passed
        } = req.body;

        if (!facultyId || !courseName || !academicYearId || !semesterTypeId) {
            return res.status(400).json({ message: "facultyId, courseName, academicYearId, and semesterTypeId are required." });
        }

        const app = Number(appeared) || 0;
        const pas = Number(passed) || 0;
        const passPercentage = app > 0 ? ((pas / app) * 100).toFixed(2) : 0;

        const record = await FacultySubjectResult.create({
            facultyId,
            facultyName,
            courseName,
            courseCode,
            courseType: courseType?.toUpperCase(),
            branch,
            section,
            semester: Number(semester) || undefined,
            noOfCos: Number(noOfCos) || 0,
            noOfCosAttained: Number(noOfCosAttained) || 0,
            academicYearId,
            semesterTypeId,
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

/**
 * GET /api/faculty-subject-results/co-attainment
 * Returns CO attainment data for a faculty filtered by academicYear & semester.
 * Data comes from the same FacultySubjectResult collection (noOfCos, noOfCosAttained).
 */
const getCoAttainment = async (req, res) => {
    try {
        const { facultyId, academicYear, semester } = req.query;
        const query = {};

        if (facultyId) query.facultyId = facultyId.trim();

        if (academicYear || semester) {
            const { academicYearId, semesterTypeId } = await resolveAcademicIds({ academicYear, semester });
            if (academicYearId) query.academicYearId = academicYearId;
            if (semesterTypeId) query.semesterTypeId = semesterTypeId;
        }

        const results = await FacultySubjectResult.find(query)
            .populate("academicYearId", "year")
            .populate("semesterTypeId", "name")
            .sort({ createdAt: -1 });

        const formatted = results.map((r) => {
            const obj = r.toObject();
            return {
                _id: obj._id,
                courseName: obj.courseName,
                courseCode: obj.courseCode,
                semester: obj.semester,
                branch: obj.branch,
                section: obj.section,
                semesterType: obj.semesterTypeId?.name || "",
                academicYear: obj.academicYearId?.year || "",
                noOfCos: obj.noOfCos || 0,
                noOfCosAttained: obj.noOfCosAttained || 0,
            };
        });

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAvailableSemesters = async (req, res) => {
    try {
        const { facultyId, academicYear } = req.query;
        const query = {};

        if (facultyId) query.facultyId = facultyId.trim();

        if (academicYear) {
            const { academicYearId } = await resolveAcademicIds({ academicYear });
            if (academicYearId) query.academicYearId = academicYearId;
        }

        const teachingSemesters = await FacultySubjectResult.distinct("semester", query);

        // Also check proctoring assignments
        const proctorQuery = {};
        if (facultyId) proctorQuery.proctorId = facultyId.trim();
        if (academicYear) {
            const { academicYearId } = await resolveAcademicIds({ academicYear });
            if (academicYearId) proctorQuery.academicYearId = academicYearId;
        }
        const proctoringSemesters = await ProcterMaping.distinct("semester", proctorQuery);

        // Merge and unique
        const allSemesters = [...new Set([...teachingSemesters, ...proctoringSemesters])];
        
        res.json(allSemesters.filter(s => s != null).sort((a, b) => a - b));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    uploadCSV,
    deleteSemesterData,
    getResults,
    getCoAttainment,
    getAvailableSemesters,
    updateResult,
    deleteResult,
    createResult
};
