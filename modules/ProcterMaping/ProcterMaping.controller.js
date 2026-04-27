const ProcterMaping = require("./ProcterMaping.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");
const Student = require("../StudentData/Studentdata.model");
const Employee = require("../employee/employee.model");
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
            "studentid",
            "academicyear",
            "semester"
        ];

        validateHeaders(rows, requiredHeaders);

        const mappings = [];
        const errors = [];

        // Cache for academic years and semester types to avoid multiple queries
        const ayCache = {};
        const semTypeCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const {
                proctorid,
                studentid,
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

            // 2. Resolve Semester Type
            // 2. Resolve Semester Type automatically based on semester number
            const numericSemester = Number(semester);
            if (isNaN(numericSemester)) {
                errors.push(`Row ${i + 2}: Invalid semester number '${semester}'.`);
                continue;
            }
            const semesterName = numericSemester % 2 === 0 ? "EVEN" : "ODD";
            
            let semTypeId = semTypeCache[semesterName];
            if (!semTypeId) {
                const st = await SemesterType.findOne({ name: semesterName });
                if (!st) {
                    errors.push(`Row ${i + 2}: Global Semester Type '${semesterName}' not found.`);
                    continue;
                }
                semTypeId = st._id;
                semTypeCache[semesterName] = semTypeId;
            }

            const pId = (proctorid || "").trim();
            const sId = (studentid || "").trim();

            if (!pId || !sId) {
                errors.push(`Row ${i + 2}: Missing proctorId or studentId.`);
                continue;
            }

            // 3. Duplicate Prevention (studentId + semTypeId + ayId)
            // A student can only have one proctor per semester
            const duplicate = await ProcterMaping.findOne({
                studentId: sId,
                semesterTypeId: semTypeId,
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

            // 4. Validate Student and Employee existence and fetch names
            const student = await Student.findOne({ rollNo: sId, "system.isActive": true });
            if (!student) {
                errors.push(`Row ${i + 2}: Student '${sId}' not found or inactive.`);
                continue;
            }

            const employee = await Employee.findOne({ institutionId: pId, isActive: true });
            if (!employee) {
                errors.push(`Row ${i + 2}: Proctor '${pId}' not found or inactive.`);
                continue;
            }

            mappings.push({
                proctorId: pId,
                proctorName: employee.name,
                studentId: sId,
                studentName: student.personalInfo.studentName,
                academicYearId: ayId,
                semesterTypeId: semTypeId,
                semester: numericSemester
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

    if (!activeAy.activeSemesterTypeId) throw new Error("No active semester type set for the current year");

    return { academicYearId: activeAy._id, semesterTypeId: activeAy.activeSemesterTypeId };
};

/**
 * Helper: Resolve IDs from provided strings or fallback to active
 */
const resolveTargetIds = async (queryAy, querySem) => {
    if (queryAy && querySem) {
        let ayId, semTypeId;

        const ay = await AcademicYear.findOne({ year: queryAy });
        if (!ay) throw new Error(`Academic Year '${queryAy}' not found`);
        ayId = ay._id;

        const st = await SemesterType.findOne({ name: querySem.toUpperCase() });
        if (!st) throw new Error(`Semester Type '${querySem}' not found`);
        semTypeId = st._id;

        return { academicYearId: ayId, semesterTypeId: semTypeId };
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
            const { academicYearId, semesterTypeId } = await resolveTargetIds(academicYear, semester);
            query.academicYearId = academicYearId;
            query.semesterTypeId = semesterTypeId;
        } else if (!proctorId && !studentId) {
            // If no specific proctor/student search, default to active
            const { academicYearId, semesterTypeId } = await resolveActiveIds();
            query.academicYearId = academicYearId;
            query.semesterTypeId = semesterTypeId;
        }

        const data = await ProcterMaping.find(query)
            .populate("academicYearId", "year")
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
        const { department, program, branch, semester } = req.query;

        if (!department || !program || !branch || !semester) {
            return res.status(400).json({ message: "Missing required filters: department, program, branch, semester" });
        }

        const numericSemester = Number(semester);

        const students = await Student.find({
            "academicInfo.department": department,
            "academicInfo.programName": program,
            "academicInfo.branch": branch,
            "academicInfo.semester": numericSemester,
            "academicInfo.studentStatus": "Regular",
            "system.isActive": true
        }).select("rollNo personalInfo.studentName");

        // Now find mappings for these students in this semester
        const mappings = await ProcterMaping.find({
            semester: numericSemester,
            studentId: { $in: students.map(s => s.rollNo) }
        });

        const mappingDict = {};
        mappings.forEach(m => {
            mappingDict[m.studentId] = m;
        });

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
 * Create mapping
 */
const createMapping = async (req, res) => {
    try {
        const { studentId, proctorId, academicYearId, semesterTypeId, semester } = req.body;

        const student = await Student.findOne({ rollNo: studentId, "system.isActive": true });
        if (!student) return res.status(404).json({ message: "Student not found" });

        const employee = await Employee.findOne({ institutionId: proctorId, isActive: true });
        if (!employee) return res.status(404).json({ message: "Proctor not found" });

        const existing = await ProcterMaping.findOne({ studentId, semester });
        if (existing) {
            return res.status(400).json({ message: "Mapping already exists for this student in this semester" });
        }

        let finalAcademicYearId = academicYearId;
        let finalSemesterTypeId = semesterTypeId;

        // Auto-resolve Academic Year if missing
        if (!finalAcademicYearId) {
            const activeAy = await AcademicYear.findOne({ isActive: true });
            if (!activeAy) return res.status(400).json({ message: "No active academic year found" });
            finalAcademicYearId = activeAy._id;
        }

        // Auto-resolve Semester Type if missing
        if (!finalSemesterTypeId && semester) {
            const numericSemester = Number(semester);
            const semesterName = numericSemester % 2 === 0 ? "EVEN" : "ODD";
            const st = await SemesterType.findOne({ name: semesterName });
            if (!st) return res.status(400).json({ message: "Global Semester Type not found" });
            finalSemesterTypeId = st._id;
        }

        const newMapping = new ProcterMaping({
            studentId,
            studentName: student.personalInfo.studentName,
            proctorId,
            proctorName: employee.name,
            academicYearId: finalAcademicYearId,
            semesterTypeId: finalSemesterTypeId,
            semester
        });

        await newMapping.save();
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
        const { academicYearId, semesterTypeId } = await resolveTargetIds(academicYear, semester);
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
