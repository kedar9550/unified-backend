const FacultySubjectResult = require("./FacultySubjectResult.model");
const escapeRegex = require("../../utils/escapeRegex");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const Employee = require("../employee/employee.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");
const ProctorMapping = require("../ProctorMapping/ProctorMapping.model");
const FacultyFeedResult = require("../FacultyFeedbackResults/FacultyFeedResult.model");

/**
 * Bulk insert from CSV (Legacy - Deprecated)
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

        const processedKeys = new Map();

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
                
                const searchId = facultyid.trim();
                const cleanId = searchId.replace(/\s+/g, "");
                const faculty = await Employee.findOne({
                    $or: [
                        { institutionId: searchId },
                        { institutionId: cleanId },
                        { institutionId: { $regex: new RegExp("^" + escapeRegex(searchId) + "$", "i") } },
                        { institutionId: { $regex: new RegExp("^" + escapeRegex(cleanId) + "$", "i") } }
                    ]
                });
                if (!faculty) {
                    const charCodes = [...facultyid].map(c => c.charCodeAt(0)).join(",");
                    throw new Error(`Faculty with ID '${facultyid}' (length: ${facultyid.length}, charCodes: [${charCodes}]) not found in system`);
                }

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
                    const escapedName = escapeRegex(programName);
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
                let ayId = ayCache[academicyear];
                if (!ayId) {
                    const ay = await AcademicYear.findOne({ year: academicyear });
                    if (!ay) throw new Error(`Academic Year '${academicyear}' not found`);
                    ayId = ay._id;
                    ayCache[academicyear] = ayId;
                }

                // 4. Resolve Branch
                const branchCacheKey = `${programDoc._id}_${branchName}`;
                let branchDoc = branchCache[branchCacheKey];
                if (!branchDoc) {
                    const escapedBranchName = escapeRegex(branchName);
                    branchDoc = await Branch.findOne({ 
                        $or: [
                            { name: { $regex: new RegExp(`^${escapedBranchName}$`, "i") } },
                            { code: branchName.toUpperCase() }
                        ],
                        programId: programDoc._id 
                    });
                    if (!branchDoc) throw new Error(`Branch '${branchName}' not found for program '${programName}'`);
                    branchCache[branchCacheKey] = branchDoc;
                }

                // Course Code and Section normalization
                const trimmedCourseCode = coursecode.trim().toUpperCase();
                const trimmedSection = (section || "").trim().toUpperCase();

                // 5. Validate Course Type
                const courseTypeInput = (coursetype || "").trim().toUpperCase();
                let finalCourseType;
                if (courseTypeInput === "T") {
                    finalCourseType = "THEORY";
                } else if (courseTypeInput === "P") {
                    finalCourseType = "PRACTICAL";
                } else if (courseTypeInput === "I") {
                    finalCourseType = "INTEGRATED";
                } else {
                    throw new Error(`Invalid Course Type '${coursetype}'. Allowed values: T (Theory), P (Practical), I (Integrated)`);
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

                // Duplicate Check
                const duplicateKey = `${ayId}_${semesterNumber}_${yearNumber}_${trimmedCourseCode}_${trimmedSection}`;

                if (processedKeys.has(duplicateKey)) {
                    const existingFacultyInCsv = processedKeys.get(duplicateKey);
                    if (existingFacultyInCsv === faculty.institutionId) {
                        throw new Error(`Duplicate entry for Course '${trimmedCourseCode}' Section '${trimmedSection}' in Sem/Year '${semester_or_year}' for this Faculty in this CSV`);
                    } else {
                        throw new Error(`Duplicate entry in CSV: Another faculty (ID: ${existingFacultyInCsv}) is also assigned to Course '${trimmedCourseCode}' Section '${trimmedSection}' in Sem/Year '${semester_or_year}'`);
                    }
                }
                
                const query = {
                    academicYearId: ayId,
                    courseCode: trimmedCourseCode,
                    section: trimmedSection
                };
                if (semesterNumber) query.semesterNumber = semesterNumber;
                if (yearNumber) query.yearNumber = yearNumber;

                const existing = await FacultySubjectResult.findOne(query);
                if (existing) {
                    if (existing.facultyId === faculty.institutionId) {
                        throw new Error(`Record already exists for Course '${trimmedCourseCode}' Section '${trimmedSection}' in Sem/Year '${semester_or_year}' for this Faculty`);
                    } else {
                        throw new Error(`Another faculty member (ID: ${existing.facultyId}) is already assigned to Course '${trimmedCourseCode}' Section '${trimmedSection}' in Sem/Year '${semester_or_year}'`);
                    }
                }
                processedKeys.set(duplicateKey, faculty.institutionId);

                results.push({
                    facultyId: faculty.institutionId,
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
            if (st) {
                semesterTypeId = st._id;
            }
        }
    }

    return { academicYearId, semesterTypeId };
};

/**
 * Helper to get the current active state (Year & Semester) for a program.
 */
const getActiveStateForProgram = async (programId) => {
    const ay = await AcademicYear.findOne({
        isGlobalActive: true
    }).populate("programs.activeSemesterTypeId");
    
    if (!ay) return null;
    
    const progEntry = ay.programs.find(p => p.programId.toString() === programId.toString());
    if (!progEntry) return null;

    return {
        year: ay.year,
        activeSemesterTypeId: progEntry.activeSemesterTypeId?._id || progEntry.activeSemesterTypeId,
        activeSemesterName: progEntry.activeSemesterTypeId?.name
    };
};

/**
 * Helper to check if a record is deletable (must match the program's active Year AND Semester)
 * Returns { deletable: boolean, reason?: string }
 */
const checkDeletability = async (academicYearId, programId, semesterTypeId) => {
    if (!academicYearId || !programId) {
        return { deletable: false, reason: "Missing record metadata (Academic Year or Program)." };
    }

    // 1. Get the record's specific academic year document
    const recordYearDoc = await AcademicYear.findById(academicYearId).populate("programs.activeSemesterTypeId");
    if (!recordYearDoc) {
        return { deletable: false, reason: "Record's academic year could not be verified." };
    }

    // 2. Find the program entry in THIS specific academic year document
    const progEntry = recordYearDoc.programs.find(p => p.programId.toString() === programId.toString());
    
    // 3. If the program is marked as Active in this year, check the semester
    if (progEntry && recordYearDoc.isGlobalActive) {
        const activeSemId = progEntry.activeSemesterTypeId?._id || progEntry.activeSemesterTypeId;
        
        if (activeSemId && semesterTypeId) {
            if (activeSemId.toString() !== semesterTypeId.toString()) {
                const recordSemDoc = await SemesterType.findById(semesterTypeId);
                const activeSemDoc = await SemesterType.findById(activeSemId);
                
                return { 
                    deletable: false, 
                    reason: `The program is currently in the ${activeSemDoc?.name || 'active'} semester of ${recordYearDoc.year}. Records from the ${recordSemDoc?.name || 'requested'} semester cannot be deleted.` 
                };
            }
        }
        // Year matches and is active, and semester matches (or isn't applicable)
        return { deletable: true };
    }

    // 4. If the program is NOT active in this year, find what the current active year IS
    const currentActiveYearDoc = await AcademicYear.findOne({
        isGlobalActive: true
    });

    return { 
        deletable: false, 
        reason: `This record belongs to ${recordYearDoc.year}, but the program's currently active year is ${currentActiveYearDoc?.year || 'a different year'}. Only records from the active period can be deleted.` 
    };
};

/**
 * Delete all records for a full semester
 * Accepts: ?academicYear=2024-2025&semester=ODD
 */
const deleteSemesterData = async (req, res) => {
    try {
        const { academicYear, academicYearId, semester, programId, facultyId } = req.query;

        const filter = {};

        // Resolve Academic Year
        if (academicYearId) {
            filter.academicYearId = academicYearId;
        } else if (academicYear) {
            const ay = await AcademicYear.findOne({ year: academicYear });
            if (ay) filter.academicYearId = ay._id;
        }

        if (!filter.academicYearId) {
            return res.status(400).json({ message: "Academic Year is required for bulk deletion" });
        }

        // Resolve Semester if provided
        if (semester) {
            const st = await SemesterType.findOne({ name: semester.toUpperCase() });
            if (st) filter.semesterTypeId = st._id;
        }

        // Add optional filters
        if (programId) filter.programId = programId;
        if (facultyId) filter.facultyId = facultyId.trim();

        // --- PROTECTION LOGIC ---
        // If we are deleting by Semester/Year, we must ensure it's the ACTIVE one for the programs involved
        const matchingYears = await AcademicYear.find({
            year: academicYear || (await AcademicYear.findById(filter.academicYearId))?.year,
            isGlobalActive: true
        });

        const activeProgramIds = [];
        matchingYears.forEach(ay => {
            ay.programs.forEach(p => {
                const pSemId = p.activeSemesterTypeId?._id || p.activeSemesterTypeId;
                if (!filter.semesterTypeId || (pSemId && pSemId.toString() === filter.semesterTypeId.toString())) {
                    activeProgramIds.push(p.programId.toString());
                }
            });
        });

        if (activeProgramIds.length === 0) {
            return res.status(403).json({ 
                message: `Deletion Blocked: The ${semester?.toUpperCase() || ''} semester for ${academicYear || 'this year'} is not currently active for any program. Historical data cannot be removed.` 
            });
        }

        // If a programId was explicitly requested, verify it's in the active list
        if (filter.programId && !activeProgramIds.includes(filter.programId.toString())) {
             const prog = await Program.findById(filter.programId);
             return res.status(403).json({ 
                 message: `Deletion Blocked: ${prog?.name || 'This program'} is not currently in the ${semester?.toUpperCase() || ''} phase. Only active period records can be deleted.` 
             });
        }

        // Only delete for programs that are currently active for this period
        filter.programId = { $in: activeProgramIds };
        // -------------------------

        const result = await FacultySubjectResult.deleteMany(filter);

        res.json({
            message: `Deleted ${result.deletedCount} records matching the criteria.`,
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
        const { facultyId, academicYear, academicYearId, semester, programId } = req.query;
        const query = {};

        if (facultyId) query.facultyId = facultyId.trim();
        if (programId) query.programId = programId;

        if (academicYearId || academicYear || semester) {
            const { academicYearId: resolvedAyId, semesterTypeId } = await resolveAcademicIds({ 
                academicYear: academicYearId || academicYear, 
                semester 
            });
            
            if (resolvedAyId) query.academicYearId = resolvedAyId;
            if (semesterTypeId) query.semesterTypeId = semesterTypeId;
        }

        const results = await FacultySubjectResult.find(query)
            .populate("academicYearId", "year")
            .populate("semesterTypeId", "name")
            .populate("branchId", "code")
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
                branchCode: obj.branchId?.code || obj.branch || "",
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

        if (updates.courseType !== undefined) {
            const courseTypeInput = (updates.courseType || "").trim().toUpperCase();
            if (courseTypeInput === "T" || courseTypeInput === "THEORY") {
                updates.courseType = "THEORY";
            } else if (courseTypeInput === "P" || courseTypeInput === "PRACTICAL") {
                updates.courseType = "PRACTICAL";
            } else if (courseTypeInput === "I" || courseTypeInput === "INTEGRATED") {
                updates.courseType = "INTEGRATED";
            } else {
                return res.status(400).json({ message: `Invalid Course Type '${updates.courseType}'. Allowed values: T (Theory), P (Practical), I (Integrated)` });
            }
        }

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
        const record = await FacultySubjectResult.findById(id);
        if (!record) return res.status(404).json({ message: "Record not found" });

        const { deletable, reason } = await checkDeletability(record.academicYearId, record.programId, record.semesterTypeId);
        if (!deletable) {
            return res.status(403).json({ 
                message: `Deletion Denied: ${reason}` 
            });
        }

        await FacultySubjectResult.findByIdAndDelete(id);

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

        const courseTypeInput = (courseType || "").trim().toUpperCase();
        let finalCourseType;
        if (courseTypeInput === "T" || courseTypeInput === "THEORY") {
            finalCourseType = "THEORY";
        } else if (courseTypeInput === "P" || courseTypeInput === "PRACTICAL") {
            finalCourseType = "PRACTICAL";
        } else if (courseTypeInput === "I" || courseTypeInput === "INTEGRATED") {
            finalCourseType = "INTEGRATED";
        } else {
            return res.status(400).json({ message: `Invalid Course Type '${courseType}'. Allowed values: T (Theory), P (Practical), I (Integrated)` });
        }

        const app = Number(appeared) || 0;
        const pas = Number(passed) || 0;
        const passPercentage = app > 0 ? ((pas / app) * 100).toFixed(2) : 0;

        const record = await FacultySubjectResult.create({
            facultyId,
            facultyName,
            courseName,
            courseCode,
            courseType: finalCourseType,
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
            .populate("branchId", "code")
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
                branchCode: obj.branchId?.code || obj.branch || "",
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
            // Find all academic year documents that match the year string (e.g. "2024-2025")
            // This is necessary because AcademicYear is per-program.
            const ayDocs = await AcademicYear.find({ year: academicYear }).select("_id");
            if (ayDocs.length > 0) {
                query.academicYearId = { $in: ayDocs.map(y => y._id) };
            }
        }

        const teachingSems  = (await FacultySubjectResult.distinct("semesterNumber", query)).filter(Boolean);
        const teachingYears = (await FacultySubjectResult.distinct("yearNumber", query)).filter(Boolean);

        // Also check proctoring assignments
        const proctorQuery = {};
        if (facultyId) proctorQuery.currentProctorId = facultyId.trim();
        if (academicYear) proctorQuery.fromAcademicYear = academicYear; 
        
        const proctoringSems  = (await ProctorMapping.distinct("fromSemester", proctorQuery)).filter(Boolean);
        const proctoringYears = (await ProctorMapping.distinct("fromYearName", proctorQuery)).filter(Boolean);

        // Also check Feedback results
        const feedQuery = {};
        if (facultyId) feedQuery.facultyId = facultyId.trim();
        if (academicYear) {
            const ayDocs = await AcademicYear.find({ year: academicYear }).select("_id");
            if (ayDocs.length > 0) {
                feedQuery.academicYearId = { $in: ayDocs.map(y => y._id) };
            }
        }
        const feedSems = (await FacultyFeedResult.distinct("semesterNumber", feedQuery)).filter(Boolean);
        const feedYears = (await FacultyFeedResult.distinct("yearNumber", feedQuery)).filter(Boolean);

        // Format and Merge
        const allItems = new Set();
        
        // Helper to format
        const addSems = (list) => list.forEach(s => {
            const str = String(s);
            if (str.includes('-S') || str.includes('Year')) {
                allItems.add(str);
            } else {
                allItems.add(`Sem-${str}`);
            }
        });
        const addYears = (list) => list.forEach(y => {
            const str = String(y);
            if (str.includes('Year')) {
                allItems.add(str);
            } else {
                allItems.add(`Year-${str}`);
            }
        });

        addSems(teachingSems);
        addSems(proctoringSems);
        addSems(feedSems);
        
        addYears(teachingYears);
        addYears(proctoringYears);
        addYears(feedYears);
        
        const sorted = Array.from(allItems).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        res.json(sorted);
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
