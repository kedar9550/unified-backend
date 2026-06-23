const FacultyFeedResult = require("./FacultyFeedResult.model");
const escapeRegex = require("../../utils/escapeRegex");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const Employee = require("../employee/employee.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");

const normalizeSubjectType = (val) => {
    if (!val) return undefined;
    const trimmed = String(val).trim().toUpperCase();
    if (trimmed === "T" || trimmed === "THEORY") {
        return "THEORY";
    } else if (trimmed === "P" || trimmed === "PRACTICAL") {
        return "PRACTICAL";
    } else if (trimmed === "I" || trimmed === "INTEGRATED") {
        return "INTEGRATED";
    }
    return trimmed;
};

/**
 * Bulk insert from CSV
 * headers: facultyId, academicYear, program, branch, subjectName, subjectCode, subjectType, section, phase, semester_or_year, totalStudents, givenStudents, percentage, overallPercentage
 */
const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        
        // Normalize subjectType variations to 'subjecttype'
        rows.forEach(row => {
            if (row.subject_type !== undefined && row.subjecttype === undefined) {
                row.subjecttype = row.subject_type;
            }
        });

        const requiredHeaders = [
            "facultyid",
            "academicyear",
            "program",
            "branch",
            "subjectname",
            "subjectcode",
            "subjecttype",
            "section",
            "phase",
            "semester_or_year",
            "totalstudents",
            "givenstudents",
            "percentage"
        ];

        validateHeaders(rows, requiredHeaders);

        const results = [];
        const errors = [];
        let successCount = 0;

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
                subjectname,
                subjectcode,
                subjecttype,
                section,
                phase,
                semester_or_year,
                totalstudents,
                givenstudents,
                percentage
            } = row;

            try {
                if (!facultyid) throw new Error("Faculty ID is missing");
                
                const faculty = await Employee.findOne({ institutionId: facultyid.trim() });
                if (!faculty) throw new Error(`Faculty with ID '${facultyid}' not found in system`);

                if (!academicyear) throw new Error("Academic Year is missing");
                if (!programName) throw new Error("Program is missing");
                if (!branchName) throw new Error("Branch is missing");
                if (!subjectcode) throw new Error("Subject Code is missing");
                
                const normalizedSubjType = normalizeSubjectType(subjecttype);
                if (!normalizedSubjType || !["THEORY", "PRACTICAL", "INTEGRATED", "Theory", "Practical", "Integrated"].includes(normalizedSubjType)) {
                    throw new Error(`Invalid subject type '${subjecttype}' (must be T, P, or I)`);
                }

                if (semester_or_year === undefined || semester_or_year === "") throw new Error("Semester/Year is missing");
                if (phase === undefined || phase === "") throw new Error("Phase is missing");

                const total = Number(totalstudents);
                const given = Number(givenstudents);
                const perc = Number(percentage);
                const phs = Number(phase);

                if (isNaN(total)) throw new Error(`Invalid totalStudents count: ${totalstudents}`);
                if (isNaN(given)) throw new Error(`Invalid givenStudents count: ${givenstudents}`);
                if (isNaN(perc)) throw new Error(`Invalid percentage: ${percentage}`);
                if (isNaN(phs) || (phs !== 1 && phs !== 2)) throw new Error(`Invalid phase '${phase}' (must be 1 or 2)`);

                // Resolve Program
                let programDoc = programCache[programName];
                if (!programDoc) {
                    const escapedProgramName = escapeRegex(programName.trim());
                    programDoc = await Program.findOne({
                        $or: [
                            { code: programName.toUpperCase().trim() },
                            { name: { $regex: new RegExp(`^${escapedProgramName}$`, "i") } }
                        ]
                    });
                    if (!programDoc) throw new Error(`Program '${programName}' not found in system`);
                    programCache[programName] = programDoc;
                }

                // Resolve Branch
                const branchCacheKey = `${programDoc._id}_${branchName}`;
                let branchDoc = branchCache[branchCacheKey];
                if (!branchDoc) {
                    const escapedBranchName = escapeRegex(branchName.trim());
                    branchDoc = await Branch.findOne({ 
                        programId: programDoc._id,
                        $or: [
                            { code: branchName.toUpperCase().trim() },
                            { name: { $regex: new RegExp(`^${escapedBranchName}$`, "i") } }
                        ]
                    });
                    if (!branchDoc) throw new Error(`Branch '${branchName}' not found for program '${programName}'`);
                    branchCache[branchCacheKey] = branchDoc;
                }
                
                const programIdFromBranch = branchDoc.programId;

                // Resolve Academic Year (AcademicYear docs are now year-string unique)
                let ayId = ayCache[`${academicyear}`];
                if (!ayId) {
                    const ay = await AcademicYear.findOne({ year: academicyear });
                    if (!ay) throw new Error(`Academic Year '${academicyear}' not found`);
                    ayId = ay._id;
                    ayCache[`${academicyear}`] = ayId;
                }

                // Program Logic (SEM vs YEAR)
                let semesterNumber = null;
                let yearNumber = null;
                let semesterTypeId = null;

                const inputStr = String(semester_or_year).trim();
                if (!programDoc) throw new Error("Program associated with branch not found");

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
                }

                // Duplicate Check
                const trimmedSubjectCode = subjectcode.trim().toUpperCase();
                const trimmedSection = (section || "").trim().toUpperCase();
                const duplicateKey = `${ayId}_${semesterNumber}_${yearNumber}_${trimmedSubjectCode}_${trimmedSection}_${phs}`;

                if (processedKeys.has(duplicateKey)) {
                    const existingFacultyInCsv = processedKeys.get(duplicateKey);
                    if (existingFacultyInCsv === facultyid.trim()) {
                        throw new Error(`Duplicate entry for Subject '${trimmedSubjectCode}' Section '${trimmedSection}' Phase ${phs} in Sem/Year '${semester_or_year}' for this Faculty in this CSV`);
                    } else {
                        throw new Error(`Duplicate entry in CSV: Another faculty (ID: ${existingFacultyInCsv}) is also assigned to Subject '${trimmedSubjectCode}' Section '${trimmedSection}' Phase ${phs} in Sem/Year '${semester_or_year}'`);
                    }
                }
                
                const query = {
                    academicYearId: ayId,
                    subjectCode: trimmedSubjectCode,
                    section: trimmedSection,
                    phase: phs
                };
                if (semesterNumber) query.semesterNumber = semesterNumber;
                if (yearNumber) query.yearNumber = yearNumber;

                const existing = await FacultyFeedResult.findOne(query);
                if (existing) {
                    if (existing.facultyId === facultyid.trim()) {
                        throw new Error(`Record already exists for Subject '${trimmedSubjectCode}' Section '${trimmedSection}' Phase ${phs} in Sem/Year '${semester_or_year}' for this Faculty`);
                    } else {
                        throw new Error(`Another faculty member (ID: ${existing.facultyId}) is already assigned to Subject '${trimmedSubjectCode}' Section '${trimmedSection}' Phase ${phs} in Sem/Year '${semester_or_year}'`);
                    }
                }
                processedKeys.set(duplicateKey, facultyid.trim());

                results.push({
                    facultyId: facultyid.trim(),
                    facultyName: faculty.name,
                    programId: programIdFromBranch,
                    branchId: branchDoc._id,
                    academicYearId: ayId,
                    semesterTypeId,
                    semesterNumber,
                    yearNumber,
                    subjectName: subjectname ? subjectname.trim() : "",
                    subjectCode: trimmedSubjectCode,
                    subjectType: normalizedSubjType,
                    branch: branchDoc.name,
                    section: trimmedSection,
                    phase: phs,
                    totalStudents: total,
                    givenStudents: given,
                    percentage: perc,
                    uploadedBy: req.user.userId
                });

                successCount++;
            } catch (err) {
                errors.push({ row: rowNum, message: err.message });
            }
        }

        if (results.length > 0) {
            await FacultyFeedResult.insertMany(results);
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
 */
const resolveAcademicIds = async ({ academicYear, semester }) => {
    let academicYearId = null;
    let semesterTypeId = null;

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
 * Helper to get the current active state (Year & Semester) for a program.
 */
const getActiveStateForProgram = async (programId) => {
    const ay = await AcademicYear.findOne({
        "programs.programId": programId,
        "programs.isActive": true
    }).populate("programs.activeSemesterTypeId");
    
    if (!ay) return null;
    
    const progEntry = ay.programs.find(p => p.programId.toString() === programId.toString());
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
    if (progEntry && progEntry.isActive) {
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
        "programs.programId": programId,
        "programs.isActive": true
    });

    return { 
        deletable: false, 
        reason: `This record belongs to ${recordYearDoc.year}, but the program's currently active year is ${currentActiveYearDoc?.year || 'a different year'}. Only records from the active period can be deleted.` 
    };
};

/**
 * Delete all records for a full semester
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
            "programs.isActive": true
        });

        const activeProgramIds = [];
        matchingYears.forEach(ay => {
            ay.programs.forEach(p => {
                const pSemId = p.activeSemesterTypeId?._id || p.activeSemesterTypeId;
                if (p.isActive && (!filter.semesterTypeId || (pSemId && pSemId.toString() === filter.semesterTypeId.toString()))) {
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

        const result = await FacultyFeedResult.deleteMany(filter);

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
 */
const getResults = async (req, res) => {
    try {
        const { facultyId, academicYear, semester, phase, programId } = req.query;
        const query = {};

        if (facultyId) query.facultyId = facultyId.trim();
        if (programId) query.programId = programId;
        if (phase) query.phase = Number(phase);

        if (academicYear || semester) {
            const { academicYearId, semesterTypeId } = await resolveAcademicIds({ academicYear, semester });
            
            if (academicYearId) {
                // IMPORTANT: AcademicYear is program-specific. 
                // For global views (like Feedback Section), we must find ALL IDs sharing the same year string.
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
 
        const results = await FacultyFeedResult.find(query)
            .populate("academicYearId", "year")
            .populate("semesterTypeId", "name")
            .populate("programId", "name")
            .populate("branchId", "code name")
            .sort({ subjectCode: 1, section: 1, phase: 1 });

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

        if (updates.subjectType !== undefined) {
            updates.subjectType = normalizeSubjectType(updates.subjectType);
        }
        if (updates.subjectCode !== undefined) {
            updates.subjectCode = updates.subjectCode.trim().toUpperCase();
        }
        if (updates.section !== undefined) {
            updates.section = updates.section.trim().toUpperCase();
        }

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
        const record = await FacultyFeedResult.findById(id);
        if (!record) return res.status(404).json({ message: "Record not found" });

        const { deletable, reason } = await checkDeletability(record.academicYearId, record.programId, record.semesterTypeId);
        if (!deletable) {
            return res.status(403).json({ 
                message: `Deletion Denied: ${reason}` 
            });
        }

        await FacultyFeedResult.findByIdAndDelete(id);

        res.json({ message: "Record deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Bulk delete records by IDs
 */
const deleteBulk = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: "No IDs provided for deletion" });
        }

        // Check all records in the selection
        const allRecords = await FacultyFeedResult.find({ _id: { $in: ids } });
        for (const record of allRecords) {
            const { deletable, reason } = await checkDeletability(record.academicYearId, record.programId, record.semesterTypeId);
            if (!deletable) {
                return res.status(403).json({ 
                    message: `Bulk Deletion Denied: One or more records are outside the active period. (e.g., Faculty: ${record.facultyName}, Subject: ${record.subjectCode} - ${reason})` 
                });
            }
        }

        const result = await FacultyFeedResult.deleteMany({
            _id: { $in: ids }
        });

        res.json({
            message: `Deleted ${result.deletedCount} records successfully.`,
            deletedCount: result.deletedCount
        });
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
            facultyId, facultyName, subjectName, subjectCode, subjectType, branch, section, phase,
            academicYearId, semesterTypeId, totalStudents, givenStudents, percentage,
            programId, branchId, semesterNumber, yearNumber
        } = req.body;
 
        if (!facultyId || !subjectName || !academicYearId || !semesterTypeId) {
            return res.status(400).json({ message: "facultyId, subjectName, academicYearId, and semesterTypeId are required." });
        }

        const normalizedSubjType = normalizeSubjectType(subjectType);

        // Duplicate Check
        const trimmedSubjectCode = (subjectCode || "").trim().toUpperCase();
        const trimmedSection = (section || "").trim().toUpperCase();
        const phs = phase ? Number(phase) : undefined;
        
        const query = {
            academicYearId,
            subjectCode: trimmedSubjectCode,
            section: trimmedSection,
            phase: phs
        };
        if (semesterNumber) query.semesterNumber = semesterNumber;
        if (yearNumber) query.yearNumber = yearNumber;

        const existing = await FacultyFeedResult.findOne(query);
        if (existing) {
            const semOrYear = semesterNumber || yearNumber || 'unknown';
            if (existing.facultyId === facultyId.trim()) {
                return res.status(400).json({ message: `Record already exists for Subject '${trimmedSubjectCode}' Section '${trimmedSection}' Phase ${phs} in Sem/Year '${semOrYear}' for this Faculty` });
            } else {
                return res.status(400).json({ message: `Another faculty member (ID: ${existing.facultyId}) is already assigned to Subject '${trimmedSubjectCode}' Section '${trimmedSection}' Phase ${phs} in Sem/Year '${semOrYear}'` });
            }
        }

        const record = await FacultyFeedResult.create({
            facultyId,
            facultyName,
            subjectName,
            subjectCode: trimmedSubjectCode,
            subjectType: normalizedSubjType,
            branch, // legacy string
            programId,
            branchId,
            semesterNumber: semesterNumber ? Number(semesterNumber) : undefined,
            yearNumber: yearNumber ? Number(yearNumber) : undefined,
            section: trimmedSection,
            phase: phase ? Number(phase) : undefined,
            academicYearId,
            semesterTypeId,
            totalStudents: Number(totalStudents) || 0,
            givenStudents: Number(givenStudents) || 0,
            percentage: Number(percentage) || 0,
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
    deleteBulk,
    createResult
};
