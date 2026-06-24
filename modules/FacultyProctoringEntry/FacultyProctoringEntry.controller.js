const mongoose = require("mongoose");
const FacultyProctoringEntry = require("./FacultyProctoringEntry.model");
const Employee = require("../employee/employee.model");
const AcademicYear = require("../academicYear/academicYear.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const escapeRegex = require("../../utils/escapeRegex");

// Helper to get row values tolerantly (ignoring spaces, underscores, case, slashes)
const getRowValue = (row, aliases) => {
    const normalize = (str) => String(str).toLowerCase().replace(/[\s_/.()-]+/g, "");
    const normalizedAliases = aliases.map(normalize);
    for (const key of Object.keys(row)) {
        if (normalizedAliases.includes(normalize(key))) {
            return row[key];
        }
    }
    return undefined;
};

/**
 * @desc    Upload Proctoring CSV/Excel
 * @route   POST /api/faculty-proctoring/upload-excel
 * @access  Private
 */
exports.uploadExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        const results = [];
        const errors = [];
        let successCount = 0;

        const academicyear = req.body.academicYear; 
        
        if (!academicyear) {
            return res.status(400).json({ message: "Academic Year is required" });
        }

        let ayDoc = await AcademicYear.findOne({ year: academicyear });
        if (!ayDoc && mongoose.Types.ObjectId.isValid(academicyear)) {
            ayDoc = await AcademicYear.findById(academicyear);
        }
        if (!ayDoc) {
            return res.status(400).json({ message: "Academic Year not found" });
        }
        const ayId = ayDoc._id;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            // Extract values using tolerant helper
            const rowAcademicYear = getRowValue(row, ["academic year", "acy", "year", "academicyear"]);
            const empId = getRowValue(row, ["emp id", "empid", "facultyid", "employeeid"]);
            const programme = getRowValue(row, ["programme", "program"]);
            const branch = getRowValue(row, ["branch"]);
            const semYear = getRowValue(row, ["sem/year", "semester/year", "semester", "year_sem", "sem_year"]);
            const section = getRowValue(row, ["sec", "section"]);
            const allotted = getRowValue(row, ["no. of students allotted for proctoring", "allotted", "allotted_students"]);
            const eligible = getRowValue(row, ["no. of students eligible for end exams (a)", "eligible", "eligible_students"]);
            const passed = getRowValue(row, ["no. of students passed (b)", "passed", "passed_students"]);

            try {
                if (!rowAcademicYear) throw new Error("Academic Year is missing");
                
                // Validate Academic Year exists in system
                const rowAyDoc = await AcademicYear.findOne({ year: String(rowAcademicYear).trim() });
                if (!rowAyDoc) {
                    throw new Error(`Academic Year '${rowAcademicYear}' not found in the system`);
                }
                
                // Ensure it matches the active/selected academic year from frontend view
                if (String(rowAyDoc._id) !== String(ayId)) {
                    throw new Error(`Academic Year '${rowAcademicYear}' does not match the selected Academic Year '${ayDoc.year}'`);
                }

                if (!empId) throw new Error("Emp Id is missing");
                
                const searchId = String(empId).trim();
                const cleanId = searchId.replace(/\s+/g, "");
                const faculty = await Employee.findOne({
                    $or: [
                        { institutionId: { $regex: new RegExp("^" + escapeRegex(searchId) + "$", "i") } },
                        { institutionId: { $regex: new RegExp("^" + escapeRegex(cleanId) + "$", "i") } }
                    ]
                });
                if (!faculty) {
                    const charCodes = [...String(empId)].map(c => c.charCodeAt(0)).join(",");
                    throw new Error(`Faculty with Emp Id '${empId}' (length: ${String(empId).length}, charCodes: [${charCodes}]) not found in the system`);
                }

                if (!programme) throw new Error("Programme is missing");
                if (!branch) throw new Error("Branch is missing");
                if (!semYear) throw new Error("Sem/Year is missing");
                if (!section) throw new Error("Sec is missing");

                // Validate Programme exists
                const programDoc = await Program.findOne({
                    $or: [
                        { code: String(programme).trim().toUpperCase() },
                        { name: { $regex: new RegExp("^" + String(programme).trim() + "$", "i") } }
                    ]
                });
                if (!programDoc) {
                    throw new Error(`Programme '${programme}' not found in the system`);
                }

                // Parse numeric value for Sem/Year
                const semYearClean = String(semYear).replace(/\D/g, "");
                const semYearNum = Number(semYearClean);
                if (isNaN(semYearNum) || semYearNum <= 0) {
                    throw new Error(`Invalid Sem/Year number: '${semYear}'`);
                }

                let semesterNumber = null;
                let yearNumber = null;

                if (programDoc.programPattern === "YEAR") {
                    yearNumber = semYearNum;
                } else {
                    semesterNumber = semYearNum;
                }

                // Check for duplicate in the database
                const duplicateDb = await FacultyProctoringEntry.findOne({
                    academicYear: ayId,
                    empId: String(empId).trim(),
                    programme: String(programme).trim(),
                    branch: String(branch).trim(),
                    semesterNumber: semesterNumber,
                    yearNumber: yearNumber,
                    section: String(section).trim()
                });
                if (duplicateDb) {
                    throw new Error(`Duplicate entry found in database for Emp Id '${empId}', Programme '${programme}', Branch '${branch}', Sem/Year '${semYear}', Sec '${section}' under Academic Year '${rowAcademicYear}'`);
                }

                // Check for duplicate in the current upload batch
                const isDuplicateBatch = results.some(r => 
                    String(r.academicYear) === String(ayId) &&
                    r.empId === String(empId).trim() &&
                    r.programme === String(programme).trim() &&
                    r.branch === String(branch).trim() &&
                    r.semesterNumber === semesterNumber &&
                    r.yearNumber === yearNumber &&
                    r.section === String(section).trim()
                );
                if (isDuplicateBatch) {
                    throw new Error(`Duplicate entry found in the uploaded file for Emp Id '${empId}', Programme '${programme}', Branch '${branch}', Sem/Year '${semYear}', Sec '${section}' under Academic Year '${rowAcademicYear}'`);
                }

                // Check for Branch
                const branchDoc = await Branch.findOne({
                    $or: [
                        { code: String(branch).trim().toUpperCase() },
                        { name: { $regex: new RegExp("^" + String(branch).trim() + "$", "i") } }
                    ]
                });

                const totalNum = Number(allotted);
                const eligibleNum = Number(eligible);
                const passedNum = Number(passed);

                if (isNaN(totalNum)) throw new Error(`Invalid allotted students count: ${allotted}`);
                if (isNaN(eligibleNum)) throw new Error(`Invalid eligible students count: ${eligible}`);
                if (isNaN(passedNum)) throw new Error(`Invalid passed students count: ${passed}`);

                if (passedNum > eligibleNum) throw new Error(`Passed (${passedNum}) cannot exceed Eligible (${eligibleNum})`);
                if (eligibleNum > totalNum) throw new Error(`Eligible (${eligibleNum}) cannot exceed Allotted (${totalNum})`);

                const passPercentage = eligibleNum > 0 ? Number(((passedNum / eligibleNum) * 100).toFixed(2)) : 0;

                results.push({
                    facultyId: faculty._id,
                    empId: faculty.institutionId,
                    facultyName: faculty.name,
                    academicYear: ayId,
                    programme: String(programme).trim(),
                    programId: programDoc._id,
                    branch: String(branch).trim(),
                    branchId: branchDoc ? branchDoc._id : null,
                    semesterNumber: semesterNumber || null,
                    yearNumber: yearNumber || null,
                    section: String(section).trim(),
                    totalStudents: totalNum,
                    eligibleStudents: eligibleNum,
                    passedStudents: passedNum,
                    passPercentage: passPercentage
                });

                successCount++;
            } catch (err) {
                errors.push({ row: rowNum, message: err.message });
            }
        }

        if (results.length > 0) {
            await FacultyProctoringEntry.insertMany(results);
        }

        res.json({
            successCount,
            failedCount: errors.length,
            errors
        });

    } catch (error) {
        console.error("Proctoring Upload Error:", error);
        res.status(500).json({ message: error.message || "An error occurred during upload." });
    }
};

/**
 * @desc    Get faculty's own proctoring entries
 * @route   GET /api/faculty-proctoring/my-entries
 * @access  Private (Faculty)
 */
exports.getMyEntries = async (req, res) => {
    try {
        const entries = await FacultyProctoringEntry.find({ facultyId: req.user.userId })
            .populate("academicYear", "year")
            .populate("programId", "name code programPattern")
            .populate("branchId", "name code")
            .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        console.error("Get My Proctoring Entries Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @desc    Delete all records for a semester/year (similar to faculty results)
 * @route   DELETE /api/faculty-proctoring/clear
 */
exports.deleteSemesterData = async (req, res) => {
    try {
        const { academicYearId } = req.query;
        if (!academicYearId) {
            return res.status(400).json({ message: "Academic Year is required" });
        }
        const result = await FacultyProctoringEntry.deleteMany({ academicYear: academicYearId });
        res.json({ message: `Deleted ${result.deletedCount} records successfully.`, deletedCount: result.deletedCount });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * @desc    Get all proctoring entries for admin/prime
 * @route   GET /api/faculty-proctoring/all
 */
exports.getAllEntries = async (req, res) => {
    try {
        const { academicYearId } = req.query;
        const query = {};
        if (academicYearId) query.academicYear = academicYearId;
        
        const entries = await FacultyProctoringEntry.find(query)
            .populate("academicYear", "year")
            .populate("facultyId", "name institutionId")
            .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
