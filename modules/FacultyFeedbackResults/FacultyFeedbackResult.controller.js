const FacultyFeedResult = require("./FacultyFeedResult.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const Employee = require("../employee/employee.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const mongoose = require("mongoose");

/**
 * Bulk insert from CSV
 * headers: facultyId, academicYear, program, branch, subjectName, subjectCode, section, phase, semester_or_year, totalStudents, givenStudents, percentage, overallPercentage
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
            "program",
            "branch",
            "subjectname",
            "subjectcode",
            "section",
            "phase",
            "semester_or_year",
            "totalstudents",
            "givenstudents",
            "percentage",
            "overallpercentage"
        ];

        validateHeaders(rows, requiredHeaders);

        const results = [];
        const errors = [];
        let successCount = 0;

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
                subjectname,
                subjectcode,
                section,
                phase,
                semester_or_year,
                totalstudents,
                givenstudents,
                percentage,
                overallpercentage
            } = row;

            try {
                if (!facultyid) throw new Error("Faculty ID is missing");
                
                const faculty = await Employee.findOne({ institutionId: facultyid.trim() });
                if (!faculty) throw new Error(`Faculty with ID '${facultyid}' not found in system`);

                if (!academicyear) throw new Error("Academic Year is missing");
                if (!programName) throw new Error("Program is missing");
                if (!branchName) throw new Error("Branch is missing");
                if (!subjectcode) throw new Error("Subject Code is missing");
                if (semester_or_year === undefined || semester_or_year === "") throw new Error("Semester/Year is missing");
                if (phase === undefined || phase === "") throw new Error("Phase is missing");

                const total = Number(totalstudents);
                const given = Number(givenstudents);
                const perc = Number(percentage);
                const overallPerc = Number(overallpercentage);
                const phs = Number(phase);

                if (isNaN(total)) throw new Error(`Invalid totalStudents count: ${totalstudents}`);
                if (isNaN(given)) throw new Error(`Invalid givenStudents count: ${givenstudents}`);
                if (isNaN(perc)) throw new Error(`Invalid percentage: ${percentage}`);
                if (isNaN(overallPerc)) throw new Error(`Invalid overallPercentage: ${overallpercentage}`);
                if (isNaN(phs) || (phs !== 1 && phs !== 2)) throw new Error(`Invalid phase '${phase}' (must be 1 or 2)`);

                // Resolve Program
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

                // Resolve Academic Year
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

                // Resolve Branch
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

                // Program Logic (SEM vs YEAR)
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
                }

                // Duplicate Check
                const trimmedSubjectCode = subjectcode.trim();
                const trimmedSection = (section || "").trim();
                const duplicateKey = `${ayId}_${trimmedSubjectCode}_${trimmedSection}_${phs}`;

                if (processedKeys.has(duplicateKey)) {
                    throw new Error(`Duplicate entry for Subject '${trimmedSubjectCode}' Section '${trimmedSection}' Phase ${phs} in this CSV`);
                }
                
                const existing = await FacultyFeedResult.findOne({
                    academicYearId: ayId,
                    subjectCode: trimmedSubjectCode,
                    section: trimmedSection,
                    phase: phs
                });
                if (existing) {
                    throw new Error(`Record already exists for Subject '${trimmedSubjectCode}' Section '${trimmedSection}' Phase ${phs} in this Academic Year`);
                }
                processedKeys.add(duplicateKey);

                results.push({
                    facultyId: facultyid.trim(),
                    facultyName: faculty.name,
                    programId: programDoc._id,
                    branchId: branchDoc._id,
                    academicYearId: ayId,
                    semesterTypeId,
                    semesterNumber,
                    yearNumber,
                    subjectName: subjectname ? subjectname.trim() : "",
                    subjectCode: trimmedSubjectCode,
                    branch: branchDoc.name,
                    section: trimmedSection,
                    phase: phs,
                    totalStudents: total,
                    givenStudents: given,
                    percentage: perc,
                    overallPercentage: overallPerc,
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
 * Delete all records for a full semester
 */
const deleteSemesterData = async (req, res) => {
    try {
        const { academicYear, semester } = req.query;

        if (!academicYear || !semester) {
            return res.status(400).json({ message: "academicYear and semester are required" });
        }

        const { academicYearId, semesterTypeId } = await resolveAcademicIds({ academicYear, semester });
 
        const result = await FacultyFeedResult.deleteMany({
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
 */
const getResults = async (req, res) => {
    try {
        const { facultyId, academicYear, semester, phase } = req.query;
        const query = {};

        if (facultyId) query.facultyId = facultyId.trim();
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
                ...obj,
                academicYear: obj.academicYearId?.year || "",
                semesterType: semType,
                semesterDisplay
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
            facultyId, facultyName, subjectName, subjectCode, branch, section, phase,
            academicYearId, semesterTypeId, totalStudents, givenStudents, percentage, overallPercentage,
            programId, branchId, semesterNumber, yearNumber
        } = req.body;
 
        if (!facultyId || !subjectName || !academicYearId || !semesterTypeId) {
            return res.status(400).json({ message: "facultyId, subjectName, academicYearId, and semesterTypeId are required." });
        }

        const record = await FacultyFeedResult.create({
            facultyId,
            facultyName,
            subjectName,
            subjectCode,
            branch, // legacy string
            programId,
            branchId,
            semesterNumber: semesterNumber ? Number(semesterNumber) : undefined,
            yearNumber: yearNumber ? Number(yearNumber) : undefined,
            section,
            phase: phase ? Number(phase) : undefined,
            academicYearId,
            semesterTypeId,
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
