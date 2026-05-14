const ProctorMapping = require("./ProctorMapping.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");
const Student = require("../StudentData/Studentdata.model");
const Employee = require("../employee/employee.model");
const { resolveActiveAcademicYear } = require("../academicYear/academicYear.controller");

/**
 * Resolve current active academic year for a program.
 */
const getActiveContext = async (program) => {
    const activeAy = await resolveActiveAcademicYear(program);
    if (!activeAy) throw new Error(`No active academic year found${program ? ` for ${program}` : ''}`);
    return activeAy.year;
};

/**
 * Internal helper to handle the logic of assigning/changing proctor.
 */
const assignProctor = async (student, employee, academicYearLabel, semester, yearName) => {
    let mapping = await ProctorMapping.findOne({ studentId: student.rollNo });

    if (!mapping) {
        // Initial Assignment
        mapping = new ProctorMapping({
            studentId: student.rollNo,
            studentName: student.personalInfo.studentName,
            currentProctorId: employee.institutionId,
            currentProctorName: employee.name,
            fromSemester: semester || null,
            fromYearName: yearName || null,
            fromAcademicYear: academicYearLabel,
            history: []
        });
    } else {
        // Check if proctor is different
        if (mapping.currentProctorId === employee.institutionId) {
            // No change needed
            return mapping;
        }

        // Move current to history
        mapping.history.push({
            proctorId: mapping.currentProctorId,
            proctorName: mapping.currentProctorName,
            fromSemester: mapping.fromSemester,
            fromYearName: mapping.fromYearName,
            fromAcademicYear: mapping.fromAcademicYear,
            toSemester: semester || null,
            toYearName: yearName || null,
            toAcademicYear: academicYearLabel,
            toDate: new Date()
        });

        // Update current
        mapping.currentProctorId = employee.institutionId;
        mapping.currentProctorName = employee.name;
        mapping.fromSemester = semester || null;
        mapping.fromYearName = yearName || null;
        mapping.fromAcademicYear = academicYearLabel;
    }

    await mapping.save();
    return mapping;
};

/**
 * Bulk insert from CSV
 */
const uploadCSV = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No CSV file uploaded" });

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = ["proctorid", "studentid", "academicyear"];
        validateHeaders(rows, requiredHeaders);

        const errors = [];
        let count = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const { proctorid, studentid, academicyear, semester, yearname } = row;

            const pId = (proctorid || "").trim();
            const sId = (studentid || "").trim();
            const ayLabel = (academicyear || "").trim();
            const semNum = parseInt(semester) || null;
            const yName = (yearname || "").trim() || null;

            if (!pId || !sId || !ayLabel) {
                errors.push(`Row ${i + 2}: Missing required fields.`);
                continue;
            }

            const [student, employee] = await Promise.all([
                Student.findOne({ rollNo: sId, "system.isActive": true }),
                Employee.findOne({ institutionId: pId, isActive: true })
            ]);

            if (!student) {
                errors.push(`Row ${i + 2}: Student '${sId}' not found.`);
                continue;
            }
            if (!employee) {
                errors.push(`Row ${i + 2}: Proctor '${pId}' not found.`);
                continue;
            }

            try {
                await assignProctor(student, employee, ayLabel, semNum, yName);
                count++;
            } catch (e) {
                errors.push(`Row ${i + 2}: ${e.message}`);
            }
        }

        res.status(201).json({
            message: `Processed ${rows.length} rows. Updated ${count} assignments.`,
            processed: count,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Get current proctor assignments with filters
 * Supports looking up proctor for a specific past semester.
 */
/**
 * Get proctor assignments with filters.
 * If academicYear and (semester or yearName) are provided, it looks up the proctor 
 * who was active during that specific period by checking history.
 */
const getMappings = async (req, res) => {
    try {
        const { studentId, proctorId, academicYear, semester, yearName } = req.query;

        let query = {};
        if (studentId) query.studentId = studentId.trim();
        if (proctorId) query.currentProctorId = proctorId.trim();

        let mappings = await ProctorMapping.find(query);

        // Fetch student details for these mappings to get department/semester
        const studentIds = mappings.map(m => m.studentId);
        const students = await Student.find({ rollNo: { $in: studentIds } })
            .select("rollNo academicInfo.department academicInfo.semester academicInfo.yearName")
            .populate("academicInfo.department", "name code");
        
        const studentMap = {};
        students.forEach(s => {
            studentMap[s.rollNo] = s;
        });

        // If a specific period is requested, filter results to show the proctor active at that time
        let results = mappings.map(m => {
            const studentInfo = studentMap[m.studentId];
            const baseData = {
                _id: m._id,
                studentId: m.studentId,
                studentName: m.studentName,
                department: studentInfo?.academicInfo?.department?.name || studentInfo?.academicInfo?.department || "—",
                currentSemester: studentInfo?.academicInfo?.semester || "—",
                currentYearName: studentInfo?.academicInfo?.yearName || "—",
                fromAcademicYear: m.fromAcademicYear,
                currentProctorId: m.currentProctorId,
                currentProctorName: m.currentProctorName,
                isHistorical: false
            };

            if (academicYear && (semester || yearName)) {
                const targetSem = parseInt(semester) || null;
                const targetYearName = yearName || null;

                // Check history first
                const historical = m.history.find(h => {
                    if (targetYearName) {
                        return h.fromYearName === targetYearName && h.fromAcademicYear === academicYear;
                    }
                    return h.fromSemester === targetSem && h.fromAcademicYear === academicYear;
                });

                if (historical) {
                    return {
                        ...baseData,
                        proctorId: historical.proctorId,
                        proctorName: historical.proctorName,
                        isHistorical: true
                    };
                }

                // Check if current assignment covers it
                const isAfterStart = (academicYear > m.fromAcademicYear) || 
                                     (academicYear === m.fromAcademicYear && (!targetSem || m.fromSemester === null || targetSem >= m.fromSemester));

                if (isAfterStart) {
                    return {
                        ...baseData,
                        proctorId: m.currentProctorId,
                        proctorName: m.currentProctorName,
                        isHistorical: false
                    };
                }

                return {
                    ...baseData,
                    proctorId: "",
                    proctorName: "",
                    isHistorical: false
                };
            }

            return baseData;
        });

        res.json(results);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Fetch students for mapping based on filters
 * Shows the current active proctor.
 */
const getStudentsForMapping = async (req, res) => {
    try {
        const { department, program, branch, semester, yearName } = req.query;

        if (!department || !program || !branch) {
            return res.status(400).json({ message: "Missing required filters" });
        }

        const studentQuery = {
            "academicInfo.department": department,
            "academicInfo.programName": new RegExp(`^${program}$`, "i"),
            "academicInfo.branch": new RegExp(`^${branch}$`, "i"),
            "academicInfo.studentStatus": "Regular",
            "system.isActive": true
        };

        if (yearName) studentQuery["academicInfo.yearName"] = yearName;
        else if (semester) studentQuery["academicInfo.semester"] = Number(semester);

        const students = await Student.find(studentQuery).select("rollNo personalInfo.studentName academicInfo.programName");

        const mappings = await ProctorMapping.find({
            studentId: { $in: students.map(s => s.rollNo) }
        });

        const mappingDict = {};
        mappings.forEach(m => { mappingDict[m.studentId] = m; });

        const result = students.map(s => {
            const mapData = mappingDict[s.rollNo];
            return {
                studentId: s.rollNo,
                studentName: s.personalInfo?.studentName,
                proctorId: mapData ? mapData.currentProctorId : "",
                proctorName: mapData ? mapData.currentProctorName : "",
                mappingId: mapData ? mapData._id : null
            };
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Create or Update mapping (Manual)
 */
const createMapping = async (req, res) => {
    try {
        const { studentId, proctorId, academicYear, semester, yearName } = req.body;
        const id = req.params.id;

        let sId = studentId;
        if (!sId && id) {
            const m = await ProctorMapping.findById(id);
            if (m) sId = m.studentId;
        }

        if (!sId) return res.status(400).json({ message: "studentId is required" });

        const [student, employee] = await Promise.all([
            Student.findOne({ rollNo: sId, "system.isActive": true }),
            Employee.findOne({ institutionId: proctorId, isActive: true })
        ]);

        if (!student) return res.status(404).json({ message: "Student not found" });
        if (!employee) return res.status(404).json({ message: "Proctor not found" });

        let ayLabel = academicYear;
        if (!ayLabel) {
            ayLabel = await getActiveContext(student.academicInfo?.programName);
        }

        const mapping = await assignProctor(student, employee, ayLabel, semester, yearName);
        res.status(201).json({ message: "Mapping updated successfully", data: mapping });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Delete mapping (Clear student's current proctor entirely)
 */
const deleteMapping = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await ProctorMapping.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ message: "Record not found" });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    uploadCSV,
    getMappings,
    getStudentsForMapping,
    createMapping,
    updateMapping: createMapping, // Re-use createMapping for updates
    deleteMapping,
};

