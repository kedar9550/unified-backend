const ProcterMaping = require("./ProcterMaping.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");
const Student = require("../StudentData/Studentdata.model");
const Employee = require("../employee/employee.model");
const { updateProctorSummaries } = require("../StudentResult/StudentResult.controller");
const { resolveActiveAcademicYear } = require("../academicYear/academicYear.controller");

/**
 * Resolve active academic year for a given program.
 * Falls back to global (program: null) if no program-specific year found.
 */
const resolveActiveIds = async (program) => {
    const activeAy = await resolveActiveAcademicYear(program);
    if (!activeAy) throw new Error(`No active academic year found${program ? ` for ${program}` : ''}`);
    if (!activeAy.activeSemesterTypeId) throw new Error("No active semester type set for the current year");
    return { academicYearId: activeAy._id, semesterTypeId: activeAy.activeSemesterTypeId, program };
};

/**
 * Resolve IDs from provided strings or fallback to active
 */
const resolveTargetIds = async (queryAy, querySem, program) => {
    if (queryAy && querySem) {
        const ay = await AcademicYear.findOne({ year: queryAy, program: program || null });
        if (!ay) {
            // Try global fallback
            const globalAy = await AcademicYear.findOne({ year: queryAy, program: null });
            if (!globalAy) throw new Error(`Academic Year '${queryAy}' not found`);
        }
        const finalAy = await AcademicYear.findOne({ year: queryAy, program: program || null })
            || await AcademicYear.findOne({ year: queryAy, program: null });

        const st = await SemesterType.findOne({ name: querySem.toUpperCase() });
        if (!st) throw new Error(`Semester Type '${querySem}' not found`);

        return { academicYearId: finalAy._id, semesterTypeId: st._id };
    }
    return await resolveActiveIds(program);
};

/**
 * Determine semesterTypeId from semester number or yearName
 * 
 * For B.Tech/M.Tech: use semester number → ODD or EVEN
 * For Pharma.D:      semType = YEAR
 * For Summer:        semType = SUMMER (passed explicitly in CSV)
 */
const resolveSemesterType = async (semesterStr, yearName, semTypeCache) => {
    // Pharma.D case
    if (yearName) {
        const key = "YEAR";
        if (!semTypeCache[key]) {
            const st = await SemesterType.findOne({ name: "YEAR" });
            if (!st) throw new Error("Semester type YEAR not found. Please seed it.");
            semTypeCache[key] = st._id;
        }
        return { semesterTypeId: semTypeCache[key], semester: null, semTypeName: "YEAR" };
    }

    // Summer case — passed as "SUMMER" in CSV semType column
    if (semesterStr && semesterStr.toString().toUpperCase() === "SUMMER") {
        const key = "SUMMER";
        if (!semTypeCache[key]) {
            const st = await SemesterType.findOne({ name: "SUMMER" });
            if (!st) throw new Error("Semester type SUMMER not found.");
            semTypeCache[key] = st._id;
        }
        return { semesterTypeId: semTypeCache[key], semester: null, semTypeName: "SUMMER" };
    }

    // Normal semester number
    const numericSemester = Number(semesterStr);
    if (isNaN(numericSemester)) {
        throw new Error(`Invalid semester '${semesterStr}'. Must be a number, "SUMMER", or leave empty for Pharma.D.`);
    }
    const semesterName = numericSemester % 2 !== 0 ? "ODD" : "EVEN";
    if (!semTypeCache[semesterName]) {
        const st = await SemesterType.findOne({ name: semesterName });
        if (!st) throw new Error(`Semester type '${semesterName}' not found.`);
        semTypeCache[semesterName] = st._id;
    }
    return { semesterTypeId: semTypeCache[semesterName], semester: numericSemester, semTypeName: semesterName };
};

/**
 * Bulk insert from CSV
 * 
 * CSV Headers:
 *   proctorid, studentid, academicyear, semester, yearname (optional)
 * 
 * Examples:
 *   B.Tech:   proctorid=F001, studentid=22B81A0501, academicyear=2025-2026, semester=3, yearname=
 *   Pharma.D: proctorid=F002, studentid=25B14PD001, academicyear=2025-2026, semester=, yearname=I Year
 *   Summer:   proctorid=F001, studentid=22B81A0501, academicyear=2025-2026, semester=SUMMER, yearname=
 */
const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = ["proctorid", "studentid", "academicyear"];
        validateHeaders(rows, requiredHeaders);

        const mappings = [];
        const errors = [];

        const ayCache = {};
        const semTypeCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const {
                proctorid,
                studentid,
                academicyear,
                semester,   // number string "1","2"... or "SUMMER" or empty for Pharma.D
                yearname    // "I Year","II Year"... for Pharma.D, empty for others
            } = row;

            const pId = (proctorid || "").trim();
            const sId = (studentid || "").trim();
            const yearName = (yearname || "").trim() || null;

            if (!pId || !sId) {
                errors.push(`Row ${i + 2}: Missing proctorId or studentId.`);
                continue;
            }

            // Validate Student
            const student = await Student.findOne({ rollNo: sId, "system.isActive": true });
            if (!student) {
                errors.push(`Row ${i + 2}: Student '${sId}' not found or inactive.`);
                continue;
            }

            // Validate Employee
            const employee = await Employee.findOne({ institutionId: pId, isActive: true });
            if (!employee) {
                errors.push(`Row ${i + 2}: Proctor '${pId}' not found or inactive.`);
                continue;
            }

            // Resolve Academic Year (program-wise)
            const program = student.academicInfo?.programName;
            const ayKey = `${academicyear}__${program}`;
            if (!ayCache[ayKey]) {
                // Try program-specific year first, then global
                const ay = await AcademicYear.findOne({ year: academicyear, program })
                    || await AcademicYear.findOne({ year: academicyear, program: null });
                if (!ay) {
                    errors.push(`Row ${i + 2}: Academic Year '${academicyear}' not found${program ? ` for ${program}` : ''}.`);
                    continue;
                }
                ayCache[ayKey] = ay._id;
            }
            const ayId = ayCache[ayKey];

            // Resolve Semester Type
            let semResolved;
            try {
                semResolved = await resolveSemesterType(semester, yearName, semTypeCache);
            } catch (e) {
                errors.push(`Row ${i + 2}: ${e.message}`);
                continue;
            }

            // Duplicate check (FIXED: includes academicYearId)
            const duplicate = await ProcterMaping.findOne({
                studentId: sId,
                semesterTypeId: semResolved.semesterTypeId,
                academicYearId: ayId
            });

            if (duplicate) {
                if (duplicate.proctorId === pId) {
                    errors.push(`Row ${i + 2}: Assignment already exists (Student ${sId} → Proctor ${pId}). Skipping.`);
                } else {
                    errors.push(`Row ${i + 2}: Student ${sId} already assigned to proctor ${duplicate.proctorId} for this semester. Skipping.`);
                }
                continue;
            }

            mappings.push({
                proctorId: pId,
                proctorName: employee.name,
                studentId: sId,
                studentName: student.personalInfo.studentName,
                academicYearId: ayId,
                semesterTypeId: semResolved.semesterTypeId,
                semester: semResolved.semester,   // null for Pharma.D and Summer
                yearName: yearName                // "I Year" for Pharma.D, null for others
            });
        }

        if (mappings.length > 0) {
            await ProcterMaping.insertMany(mappings);
            await updateProctorSummaries(mappings);
        }

        res.status(201).json({
            message: `Processed ${rows.length} rows. Uploaded ${mappings.length} mappings.`,
            processed: mappings.length,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        console.error("CSV Upload Error:", error);
        res.status(500).json({ message: error.message || "An error occurred during upload." });
    }
};

/**
 * Get mappings with filters
 */
const getMappings = async (req, res) => {
    try {
        const { academicYear, semester, proctorId, studentId, academicYearId, semesterTypeId, program } = req.query;
        const query = {};

        if (proctorId) query.proctorId = proctorId.trim();
        if (studentId) query.studentId = studentId.trim();
        if (academicYearId) query.academicYearId = academicYearId;
        if (semesterTypeId) query.semesterTypeId = semesterTypeId;

        if (!academicYearId && !semesterTypeId) {
            if (academicYear && semester) {
                const { academicYearId: resolvedAy, semesterTypeId: resolvedSem } = await resolveTargetIds(academicYear, semester, program);
                query.academicYearId = resolvedAy;
                query.semesterTypeId = resolvedSem;
            } else if (!proctorId && !studentId) {
                const { academicYearId: activeAy, semesterTypeId: activeSem } = await resolveActiveIds(program);
                query.academicYearId = activeAy;
                query.semesterTypeId = activeSem;
            }
        }

        const data = await ProcterMaping.find(query)
            .populate("academicYearId", "year program")
            .populate("semesterTypeId", "name")
            .sort({ studentId: 1 });

        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Fetch students for mapping based on filters
 */
const getStudentsForMapping = async (req, res) => {
    try {
        const { department, program, branch, semester, yearName } = req.query;

        if (!department || !program || !branch) {
            return res.status(400).json({ message: "Missing required filters: department, program, branch" });
        }

        const studentQuery = {
            "academicInfo.department": department,
            "academicInfo.programName": new RegExp(`^${program}$`, "i"),
            "academicInfo.branch": new RegExp(`^${branch}$`, "i"),
            "academicInfo.studentStatus": "Regular",
            "system.isActive": true
        };

        // Pharma.D: filter by yearName
        if (yearName) {
            studentQuery["academicInfo.yearName"] = yearName;
        } else if (semester) {
            studentQuery["academicInfo.semester"] = Number(semester);
        }

        const students = await Student.find(studentQuery).select("rollNo personalInfo.studentName academicInfo.programName");

        // Get active semester type for this program
        const activeAy = await resolveActiveAcademicYear(program);
        const activeSemTypeId = activeAy?.activeSemesterTypeId;
        const activeAyId = activeAy?._id;

        const mappings = await ProcterMaping.find({
            studentId: { $in: students.map(s => s.rollNo) },
            academicYearId: activeAyId,
            semesterTypeId: activeSemTypeId
        });

        const mappingDict = {};
        mappings.forEach(m => { mappingDict[m.studentId] = m; });

        const result = students.map(s => {
            const mapData = mappingDict[s.rollNo];
            return {
                studentId: s.rollNo,
                studentName: s.personalInfo?.studentName,
                proctorId: mapData ? mapData.proctorId : "",
                proctorName: mapData ? mapData.proctorName : "",
                mappingId: mapData ? mapData._id : null
            };
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Create single mapping
 */
const createMapping = async (req, res) => {
    try {
        const { studentId, proctorId, academicYearId, semesterTypeId, semester, yearName } = req.body;

        const student = await Student.findOne({ rollNo: studentId, "system.isActive": true });
        if (!student) return res.status(404).json({ message: "Student not found" });

        const employee = await Employee.findOne({ institutionId: proctorId, isActive: true });
        if (!employee) return res.status(404).json({ message: "Proctor not found" });

        // FIXED: Check for existing using correct 3-field index
        const existing = await ProcterMaping.findOne({
            studentId,
            academicYearId,
            semesterTypeId
        });
        if (existing) {
            return res.status(400).json({ message: "Mapping already exists for this student in this semester and academic year" });
        }

        let finalAcademicYearId = academicYearId;
        let finalSemesterTypeId = semesterTypeId;

        if (!finalAcademicYearId) {
            const program = student.academicInfo?.programName;
            const activeAy = await resolveActiveAcademicYear(program);
            if (!activeAy) return res.status(400).json({ message: "No active academic year found" });
            finalAcademicYearId = activeAy._id;
        }

        if (!finalSemesterTypeId) {
            const semTypeCache = {};
            const semResolved = await resolveSemesterType(semester, yearName, semTypeCache);
            finalSemesterTypeId = semResolved.semesterTypeId;
        }

        const newMapping = new ProcterMaping({
            studentId,
            studentName: student.personalInfo.studentName,
            proctorId,
            proctorName: employee.name,
            academicYearId: finalAcademicYearId,
            semesterTypeId: finalSemesterTypeId,
            semester: semester || null,
            yearName: yearName || null
        });

        await newMapping.save();
        await updateProctorSummaries([newMapping]);
        res.status(201).json({ message: "Created successfully", data: newMapping });
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
        const { proctorId } = req.body;

        let updateData = { ...req.body };

        if (proctorId) {
            const employee = await Employee.findOne({ institutionId: proctorId, isActive: true });
            if (!employee) return res.status(404).json({ message: "Proctor not found" });
            updateData.proctorName = employee.name;
        }

        const updated = await ProcterMaping.findByIdAndUpdate(id, updateData, { new: true });
        if (!updated) return res.status(404).json({ message: "Record not found" });
        await updateProctorSummaries([updated]);
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
        const { academicYear, semester, program } = req.query;
        if (!academicYear || !semester) {
            return res.status(400).json({ message: "academicYear and semester are required" });
        }
        const { academicYearId, semesterTypeId } = await resolveTargetIds(academicYear, semester, program);
        const result = await ProcterMaping.deleteMany({ academicYearId, semesterTypeId });
        res.json({ message: `Deleted ${result.deletedCount} mappings.`, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    uploadCSV,
    getMappings,
    getStudentsForMapping,
    createMapping,
    updateMapping,
    deleteMapping,
    deleteSemesterData
};
