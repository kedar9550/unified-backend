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
        const { academicYearId, facultyId } = req.query;
        const query = {};
        if (academicYearId) query.academicYear = academicYearId;
        
        if (facultyId) {
            const employee = await Employee.findOne({
                $or: [
                    { institutionId: facultyId },
                    { _id: mongoose.Types.ObjectId.isValid(facultyId) ? facultyId : null }
                ]
            });
            if (employee) {
                query.facultyId = employee._id;
            } else {
                query.empId = facultyId;
            }
        }
        
        const entries = await FacultyProctoringEntry.find(query)
            .populate("academicYear", "year")
            .populate("facultyId", "name institutionId")
            .populate("programId", "name code programPattern")
            .populate("branchId", "name code")
            .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @desc    Create a single manual proctoring entry
 * @route   POST /api/faculty-proctoring
 * @access  Private (Admin, Exam Cell, Faculty)
 */
exports.createEntry = async (req, res) => {
    try {
        const {
            academicYear, programId, branchId, semesterNumber, yearNumber, section,
            totalStudents, eligibleStudents, passedStudents, facultyId, empId, facultyName
        } = req.body;

        let fId = facultyId;
        let eId = empId;
        let fName = facultyName;

        if (!fId) {
            const faculty = await Employee.findById(req.user.userId);
            if (!faculty) return res.status(404).json({ message: "Faculty not found" });
            fId = faculty._id;
            eId = faculty.institutionId;
            fName = faculty.name;
        } else {
            const faculty = await Employee.findOne({
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(fId) ? fId : null },
                    { institutionId: eId || fId }
                ]
            });
            if (faculty) {
                fId = faculty._id;
                eId = faculty.institutionId;
                fName = faculty.name;
            }
        }

        const programDoc = await Program.findById(programId);
        if (!programDoc) return res.status(400).json({ message: "Program not found" });

        const branchDoc = await Branch.findById(branchId);
        if (!branchDoc) return res.status(400).json({ message: "Branch not found" });

        const secVal = String(section).trim().toUpperCase();

        // Duplicate Check
        const duplicateQuery = {
            facultyId: fId,
            academicYear,
            programId,
            branchId,
            section: secVal
        };
        if (programDoc.programPattern === "YEAR") {
            duplicateQuery.yearNumber = Number(yearNumber);
        } else {
            duplicateQuery.semesterNumber = Number(semesterNumber);
        }

        const existing = await FacultyProctoringEntry.findOne(duplicateQuery);
        if (existing) {
            return res.status(400).json({ message: `Record already exists for Program/Branch Section '${section}' in this semester/year.` });
        }

        const total = Number(totalStudents) || 0;
        const eligible = Number(eligibleStudents) || 0;
        const passed = Number(passedStudents) || 0;

        if (passed > eligible) return res.status(400).json({ message: "Passed students cannot exceed eligible students" });
        if (eligible > total) return res.status(400).json({ message: "Eligible students cannot exceed allotted students" });

        const passPercentage = eligible > 0 ? Number(((passed / eligible) * 100).toFixed(2)) : 0;

        const entry = await FacultyProctoringEntry.create({
            facultyId: fId,
            empId: eId,
            facultyName: fName,
            academicYear,
            programme: programDoc.name,
            programId,
            branch: branchDoc.name,
            branchId,
            semesterNumber: programDoc.programPattern === "YEAR" ? null : (Number(semesterNumber) || null),
            yearNumber: programDoc.programPattern === "YEAR" ? (Number(yearNumber) || null) : null,
            section: secVal,
            totalStudents: total,
            eligibleStudents: eligible,
            passedStudents: passed,
            passPercentage
        });

        res.status(201).json({ success: true, message: "Proctoring entry created successfully", data: entry });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @desc    Update a single manual proctoring entry
 * @route   PUT /api/faculty-proctoring/:id
 * @access  Private (Admin, Exam Cell, Faculty)
 */
exports.updateEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.section !== undefined) {
            updates.section = String(updates.section).trim().toUpperCase();
        }

        if (updates.eligibleStudents !== undefined || updates.passedStudents !== undefined || updates.totalStudents !== undefined || updates.section !== undefined || updates.semesterNumber !== undefined || updates.yearNumber !== undefined || updates.programId !== undefined || updates.branchId !== undefined) {
            const existing = await FacultyProctoringEntry.findById(id);
            if (!existing) return res.status(404).json({ message: "Record not found" });

            const total = updates.totalStudents !== undefined ? Number(updates.totalStudents) : existing.totalStudents;
            const eligible = updates.eligibleStudents !== undefined ? Number(updates.eligibleStudents) : existing.eligibleStudents;
            const passed = updates.passedStudents !== undefined ? Number(updates.passedStudents) : existing.passedStudents;

            if (passed > eligible) return res.status(400).json({ message: "Passed students cannot exceed eligible students" });
            if (eligible > total) return res.status(400).json({ message: "Eligible students cannot exceed allotted students" });

            updates.passPercentage = eligible > 0 ? Number(((passed / eligible) * 100).toFixed(2)) : 0;

            // Duplicate Check
            const sec = updates.section !== undefined ? updates.section : existing.section;
            const prog = updates.programId !== undefined ? updates.programId : existing.programId;
            const br = updates.branchId !== undefined ? updates.branchId : existing.branchId;
            const ay = updates.academicYear !== undefined ? updates.academicYear : existing.academicYear;

            const query = {
                _id: { $ne: id },
                facultyId: existing.facultyId,
                academicYear: ay,
                programId: prog,
                branchId: br,
                section: sec
            };

            const programDoc = await Program.findById(prog);
            const isYearProg = programDoc ? programDoc.programPattern === "YEAR" : (existing.yearNumber !== null && existing.yearNumber !== undefined);

            if (isYearProg) {
                query.yearNumber = updates.yearNumber !== undefined ? Number(updates.yearNumber) : existing.yearNumber;
            } else {
                query.semesterNumber = updates.semesterNumber !== undefined ? Number(updates.semesterNumber) : existing.semesterNumber;
            }

            const duplicate = await FacultyProctoringEntry.findOne(query);
            if (duplicate) {
                return res.status(400).json({ message: `Another proctoring record already exists for Section '${sec}' in this semester/year.` });
            }
        }

        const updated = await FacultyProctoringEntry.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updated) return res.status(404).json({ message: "Record not found" });

        res.json({ success: true, message: "Record updated successfully", data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * @desc    Delete a single manual proctoring entry
 * @route   DELETE /api/faculty-proctoring/:id
 * @access  Private (Admin, Exam Cell, Faculty)
 */
exports.deleteEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await FacultyProctoringEntry.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ message: "Record not found" });
        res.json({ success: true, message: "Record deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
