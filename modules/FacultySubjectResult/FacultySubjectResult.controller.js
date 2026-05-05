const FacultySubjectResult = require("./FacultySubjectResult.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
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
        // ... (rest of old logic could go here, but I'll just restore the basic structure if it's legacy)
        // Actually, I'll restore the original uploadCSV logic as much as possible from the previous view.
        res.status(400).json({ message: "This route is deprecated. Use /upload-results instead." });
    } catch (error) {
        console.error("CSV Upload Error:", error);
        res.status(500).json({ message: error.message || "An error occurred during upload." });
    }
};

/**
 * Unified Upload: Supports SEM and YEAR based programs
 */
const uploadUnifiedResults = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = [
            "facultyid",
            "academicyear",
            "program",
            "branch",
            "coursename",
            "coursecode",
            "coursetype",
            "semester_or_year",
            "appeared",
            "passed",
            "noofcos",
            "noofcosattained",
            "section"
        ];

        // Basic header validation (case insensitive check usually handled by parseCSV or validateHeaders)
        validateHeaders(rows, requiredHeaders);

        const results = [];
        const errors = [];
        let successCount = 0;

        // Caches for optimization
        const ayCache = {};
        const programCache = {};
        const branchCache = {};
        const semTypeCache = {};

        const processedKeys = new Set();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;
            const {
                facultyid,
                academicyear,
                program: programName,
                branch: branchName,
                coursename,
                coursecode,
                coursetype,
                semester_or_year,
                appeared,
                passed,
                noofcos,
                noofcosattained,
                section
            } = row;

            try {
                // 1. Validate mandatory fields
                if (!facultyid) throw new Error("Faculty ID is missing");
                
                const faculty = await Employee.findOne({ institutionId: facultyid.trim() });
                if (!faculty) throw new Error(`Faculty with ID '${facultyid}' not found in system`);

                if (!academicyear) throw new Error("Academic Year is missing");
                if (!programName) throw new Error("Program is missing");
                if (!branchName) throw new Error("Branch is missing");
                if (!coursecode) throw new Error("Course Code is missing");
                if (!coursetype) throw new Error("Course Type is missing");
                if (semester_or_year === undefined || semester_or_year === "") throw new Error("Semester/Year is missing");
                if (appeared === undefined || appeared === "") throw new Error("Appeared count is missing");
                if (passed === undefined || passed === "") throw new Error("Passed count is missing");
                if (noofcos === undefined || noofcos === "") throw new Error("No. of COs is missing");
                if (noofcosattained === undefined || noofcosattained === "") throw new Error("No. of COs Attained is missing");
                if (!section) throw new Error("Section is missing");

                const app = Number(appeared);
                const pas = Number(passed);
                const cos = Number(noofcos);
                const cosA = Number(noofcosattained);

                if (isNaN(app)) throw new Error(`Invalid Appeared count: ${appeared}`);
                if (isNaN(pas)) throw new Error(`Invalid Passed count: ${passed}`);
                if (pas > app) throw new Error(`Passed (${pas}) cannot be more than Appeared (${app})`);
                if (isNaN(cos)) throw new Error(`Invalid No. of COs: ${noofcos}`);
                if (isNaN(cosA)) throw new Error(`Invalid No. of COs Attained: ${noofcosattained}`);
                if (cosA > cos) throw new Error(`COs Attained (${cosA}) cannot be more than Total COs (${cos})`);

                // 2. Resolve Program
                let programDoc = programCache[programName];
                if (!programDoc) {
                    const escapedName = programName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    programDoc = await Program.findOne({ 
                        $or: [
                            { name: { $regex: new RegExp(`^${escapedName}$`, "i") } },
                            { code: programName.toUpperCase() }
                        ]
                    });
                    if (!programDoc) throw new Error(`Program '${programName}' not found`);
                    programCache[programName] = programDoc;
                }

                // 3. Resolve Academic Year
                let ayId = ayCache[`${academicyear}_${programDoc._id}`];
                if (!ayId) {
                    const ay = await AcademicYear.findOne({ year: academicyear, programId: programDoc._id });
                    if (!ay) {
                        const fallbackAy = await AcademicYear.findOne({ year: academicyear });
                        if (!fallbackAy) throw new Error(`Academic Year '${academicyear}' not found`);
                        ayId = fallbackAy._id;
                    } else {
                        ayId = ay._id;
                    }
                    ayCache[`${academicyear}_${programDoc._id}`] = ayId;
                }

                // --- DUPLICATE CHECK ---
                const trimmedCourseCode = coursecode.trim();
                const trimmedSection = section.trim();
                const duplicateKey = `${ayId}_${trimmedCourseCode}_${trimmedSection}`;

                if (processedKeys.has(duplicateKey)) {
                    throw new Error(`Duplicate entry for Course '${trimmedCourseCode}' Section '${trimmedSection}' in this CSV`);
                }
                
                const existing = await FacultySubjectResult.findOne({
                    academicYearId: ayId,
                    courseCode: trimmedCourseCode,
                    section: trimmedSection
                });
                if (existing) {
                    throw new Error(`Record already exists for Course '${trimmedCourseCode}' Section '${trimmedSection}' in this Academic Year`);
                }
                processedKeys.add(duplicateKey);
                // -----------------------

                // 4. Resolve Branch
                let branchDoc = branchCache[branchName];
                if (!branchDoc) {
                    branchDoc = await Branch.findOne({ 
                        $or: [
                            { name: { $regex: new RegExp(`^${branchName}$`, "i") } },
                            { code: branchName.toUpperCase() }
                        ],
                        programId: programDoc._id 
                    });
                    if (!branchDoc) throw new Error(`Branch '${branchName}' not found for program '${programName}'`);
                    branchCache[branchName] = branchDoc;
                }

                // 5. Validate Course Type
                const finalCourseType = coursetype.toUpperCase().trim();
                if (!["THEORY", "PRACTICAL", "INTEGRATED"].includes(finalCourseType)) {
                    throw new Error(`Invalid Course Type '${coursetype}'. Allowed: THEORY, PRACTICAL, INTEGRATED`);
                }

                // 6. Program Logic (SEM vs YEAR)
                let semesterNumber = null;
                let yearNumber = null;
                let semesterTypeId = null;

                const inputStr = String(semester_or_year).trim();

                if (programDoc.programPattern === "SEMESTER") {
                    if (inputStr.toUpperCase().includes("S")) {
                        let st = semTypeCache["SUMMER"];
                        if (!st) {
                            st = await SemesterType.findOne({ name: "SUMMER" });
                            if (!st) throw new Error("Semester Type 'SUMMER' not found in system");
                            semTypeCache["SUMMER"] = st;
                        }
                        semesterTypeId = st._id;
                        semesterNumber = inputStr.toUpperCase();
                    } else {
                        const num = Number(inputStr);
                        if (isNaN(num)) throw new Error(`Invalid semester number '${inputStr}' for SEM program`);
                        
                        semesterNumber = inputStr; 
                        const typeStr = num % 2 === 0 ? "EVEN" : "ODD";
                        
                        let st = semTypeCache[typeStr];
                        if (!st) {
                            st = await SemesterType.findOne({ name: typeStr });
                            if (!st) throw new Error(`Semester Type '${typeStr}' not found in system`);
                            semTypeCache[typeStr] = st;
                        }
                        semesterTypeId = st._id;
                    }
                } else if (programDoc.programPattern === "YEAR") {
                    const num = Number(inputStr);
                    if (isNaN(num)) throw new Error(`Invalid year number '${inputStr}' for YEAR program`);
                    yearNumber = inputStr; 
                    semesterTypeId = null; 
                } else {
                    throw new Error(`Unsupported program pattern '${programDoc.programPattern}'`);
                }

                // 7. Calculate Pass Percentage
                const passPercentage = app > 0 ? ((pas / app) * 100).toFixed(2) : 0;

                results.push({
                    facultyId: facultyid.trim(),
                    facultyName: faculty.name, // Taken from DB Employee collection
                    programId: programDoc._id,
                    branchId: branchDoc._id,
                    academicYearId: ayId,
                    semesterTypeId,
                    semesterNumber,
                    yearNumber,
                    courseName: coursename ? coursename.trim() : "",
                    courseCode: trimmedCourseCode,
                    courseType: finalCourseType,
                    appeared: app,
                    passed: pas,
                    passPercentage: Number(passPercentage),
                    noOfCos: cos,
                    noOfCosAttained: cosA,
                    section: trimmedSection,
                    uploadedBy: req.user.userId,
                    branch: branchDoc.name,
                });

                successCount++;
            } catch (err) {
                errors.push({ row: rowNum, message: err.message });
            }
        }

        // Bulk Insert
        if (results.length > 0) {
            await FacultySubjectResult.insertMany(results);
        }

        res.json({
            successCount,
            failedCount: errors.length,
            errors
        });

    } catch (error) {
        console.error("Unified Upload Error:", error);
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
            
            if (academicYearId) {
                // IMPORTANT: AcademicYear is program-specific. 
                // For global views (like Exam Section), we must find ALL IDs sharing the same year string.
                const ayDoc = await AcademicYear.findById(academicYearId);
                if (ayDoc) {
                    const allAysForYear = await AcademicYear.find({ year: ayDoc.year }).select("_id");
                    query.academicYearId = { $in: allAysForYear.map(y => y._id) };
                } else {
                    query.academicYearId = academicYearId;
                }
            }
            
            if (semesterTypeId) query.semesterTypeId = semesterTypeId;
        }

        const results = await FacultySubjectResult.find(query)
            .populate("academicYearId", "year")
            .populate("semesterTypeId", "name")
            .sort({ createdAt: -1 });

        // Flatten populated fields for frontend consumption
        const formatted = results.map((r) => {
            const obj = r.toObject();
            const semType = obj.semesterTypeId?.name || "";
            
            let semesterDisplay = "";
            if (semType === "SUMMER") {
                semesterDisplay = "Summer";
            } else if (obj.yearNumber) {
                semesterDisplay = `Year-${obj.yearNumber}`;
            } else if (obj.semesterNumber) {
                semesterDisplay = `Sem-${obj.semesterNumber}`;
            }

            return {
                ...obj,
                academicYear: obj.academicYearId?.year || "",
                semesterType: semType,
                semesterDisplay,
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
            const semType = obj.semesterTypeId?.name || "";

            let semesterDisplay = "";
            if (semType === "SUMMER") {
                semesterDisplay = "Summer";
            } else if (obj.yearNumber) {
                semesterDisplay = `Year-${obj.yearNumber}`;
            } else if (obj.semesterNumber) {
                semesterDisplay = `Sem-${obj.semesterNumber}`;
            }

            return {
                _id: obj._id,
                courseName: obj.courseName,
                courseCode: obj.courseCode,
                semester: obj.semesterNumber || obj.yearNumber,
                semesterDisplay,
                branch: obj.branch,
                section: obj.section,
                semesterType: semType,
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
    uploadUnifiedResults,
    deleteSemesterData,
    getResults,
    getCoAttainment,
    getAvailableSemesters,
    updateResult,
    deleteResult,
    createResult
};
