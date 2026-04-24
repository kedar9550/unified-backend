const StudentResult = require("./StudentResult.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const ProcterMaping = require("../ProcterMaping/ProcterMaping.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const ProctorSummary = require("../ProctorSummary/ProctorSummary.model");
// @desc    Download CSV template specific to program (no program column in CSV)
// @route   GET /api/student-results/template
const downloadTemplate = (req, res) => {
    const headers = [
        "studentid",
        "studentname",
        "subjectcode",
        "subjectname",
        "academicyear",
        "semester",
        "branchcode",
        "examyear",
        "resulttype",
        "grade",
        "subjecttype",
        "sgpa",
        "cgpa"
    ];
    const csvContent = headers.join(",") + "\n";

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=student_result_template.csv");
    res.status(200).send(csvContent);
};

// Helper to recalculate Proctor Summaries safely using upsert
const updateProctorSummaries = async (uploadedResults) => {
    try {
        console.log(`[ProctorSummary] Starting update for ${uploadedResults.length} uploaded results`);
        const termData = {}; 

        uploadedResults.forEach(r => {
            const key = `${r.academicYearId}_${r.semesterTypeId}`;
            if (!termData[key]) {
                termData[key] = {
                    academicYearId: r.academicYearId,
                    semesterTypeId: r.semesterTypeId,
                    studentIds: new Set()
                };
            }
            termData[key].studentIds.add(r.studentId);
        });

        console.log(`[ProctorSummary] Found ${Object.keys(termData).length} unique terms`);

        for (const key of Object.keys(termData)) {
            const { academicYearId, semesterTypeId, studentIds } = termData[key];
            const sIdsArray = Array.from(studentIds);
            
            console.log(`[ProctorSummary] Term ${key}: Checking ${sIdsArray.length} students`);

            // Find proctors mapped to these students for this Academic Year (ignoring strict semester match)
            const mappings = await ProcterMaping.find({
                academicYearId: academicYearId,
                studentId: { $in: sIdsArray }
            });

            console.log(`[ProctorSummary] Found ${mappings.length} ProcterMaping records for term`);

            if (mappings.length === 0) continue;

            const proctorMap = {}; // Group by proctorId
            mappings.forEach(m => {
                if (!proctorMap[m.proctorId]) {
                    proctorMap[m.proctorId] = { proctorName: m.proctorName };
                }
            });

            console.log(`[ProctorSummary] Found ${Object.keys(proctorMap).length} unique proctors mapped to these students`);

            for (const [proctorId, pData] of Object.entries(proctorMap)) {
                // Fetch ALL their assigned students for this Academic Year to ensure accurate total count
                const allProctorMappings = await ProcterMaping.find({
                    proctorId: proctorId,
                    academicYearId: academicYearId
                });
                
                // Use a Set to enforce unique students (in case they mapped the same student in multiple semesters)
                const uniqueAssignedSIds = new Set(allProctorMappings.map(m => m.studentId));
                const allAssignedSIds = Array.from(uniqueAssignedSIds);

                // Fetch REGULAR results for all their assigned students
                const results = await StudentResult.find({
                    studentId: { $in: allAssignedSIds },
                    academicYearId: academicYearId,
                    semesterTypeId: semesterTypeId,
                    resultType: "REGULAR"
                });

                console.log(`[ProctorSummary] Proctor ${proctorId}: assigned ${allAssignedSIds.length} students, fetched ${results.length} result records`);

                const failedStudentIds = new Set();
                results.forEach(resRow => {
                    if (resRow.result && resRow.result.toUpperCase() === "FAIL") {
                        failedStudentIds.add(resRow.studentId);
                    }
                });

                const appearedStudentIds = new Set(results.map(r => r.studentId));
                const totalAssigned = allAssignedSIds.length;
                const studentsAppeared = appearedStudentIds.size;
                const studentsFailed = failedStudentIds.size;
                
                // Passed = Students who actually had results (appeared) minus those who failed
                const studentsPassed = studentsAppeared - studentsFailed;
                
                // Pass percentage is (Passed / Appeared) * 100
                const passPercentage = studentsAppeared > 0 ? ((studentsPassed / studentsAppeared) * 100).toFixed(2) : 0;

                console.log(`[ProctorSummary] Proctor ${proctorId}: Total:${totalAssigned}, Appeared:${appearedStudentIds.size}, Passed:${studentsPassed}, Fail:${studentsFailed}, %:${passPercentage}`);

                const updated = await ProctorSummary.findOneAndUpdate(
                    {
                        academicYearId: academicYearId,
                        semesterTypeId: semesterTypeId,
                        proctorId: proctorId
                    },
                    {
                        $set: {
                            proctorName: pData.proctorName,
                            totalMappedStudents: totalAssigned,
                            studentsAppeared: appearedStudentIds.size,
                            studentsPassed: studentsPassed,
                            passPercentage: Number(passPercentage),
                            lastCalculatedAt: new Date()
                        }
                    },
                    { upsert: true, new: true, runValidators: true } // Added runValidators
                );
                console.log(`[ProctorSummary] Successfully upserted summary for proctor ${proctorId}`);
            }
        }
        console.log(`[ProctorSummary] Finished updateProctorSummaries`);
    } catch (err) {
        console.error("Error updating proctor summaries in background: ", err);
    }
};

const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const { programId } = req.body;

        if (!programId) {
            return res.status(400).json({ message: "Program ID is required from frontend selection" });
        }

        const programObj = await Program.findById(programId);
        if (!programObj) {
            return res.status(404).json({ message: "Selected program not found." });
        }

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = [
            "studentid",
            "studentname",
            "subjectcode",
            "subjectname",
            "academicyear",
            "semester",
            "branchcode",
            "examyear",
            "resulttype",
            "grade",
            "subjecttype",
            "sgpa",
            "cgpa"
        ];

        validateHeaders(rows, requiredHeaders);

        const results = [];
        const errors = [];

        // Cache for optimization
        const ayCache = {};
        const semTypeCache = {};
        const branchCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const {
                studentid,
                studentname,
                subjectcode,
                subjectname,
                academicyear,
                semester,
                branchcode,
                examyear,
                resulttype,
                grade,
                subjecttype,
                sgpa,
                cgpa
            } = row;

            const rowNum = i + 2;

            // 1. Resolve Academic Year
            let ayId = ayCache[academicyear];
            if (!ayId) {
                const ay = await AcademicYear.findOne({ year: academicyear });
                if (!ay) {
                    errors.push(`Row ${rowNum}: Academic Year '${academicyear}' not found.`);
                    continue;
                }
                ayId = ay._id;
                ayCache[academicyear] = ayId;
            }

            // 2. Resolve Semester Type and Semester instance automatically
            let semesterTypeName = "";
            const semVal = (semester || "").toString().trim().toUpperCase();

            if (semVal === "SUMMER") {
                semesterTypeName = "SUMMER";
            } else {
                const semNum = parseInt(semVal);
                if (isNaN(semNum)) {
                    errors.push(`Row ${rowNum}: Invalid semester value '${semester}'.`);
                    continue;
                }
                semesterTypeName = semNum % 2 === 0 ? "EVEN" : "ODD";
            }

            // Resolve SemesterType ID
            let semTypeId = semTypeCache[semesterTypeName];
            if (!semTypeId) {
                const st = await SemesterType.findOne({ name: semesterTypeName });
                if (!st) {
                    errors.push(`Row ${rowNum}: Global Semester Type '${semesterTypeName}' not found. Please seed semester types.`);
                    continue;
                }
                semTypeId = st._id;
                semTypeCache[semesterTypeName] = semTypeId;
            }

            // 3. Resolve Branch from short code in CSV
            const branchShortCode = (branchcode || "").toString().trim().toUpperCase();
            let branchData = branchCache[branchShortCode];
            if (!branchData) {
                const branchObj = await Branch.findOne({
                    programId: programId,
                    code: branchShortCode
                });
                if (!branchObj) {
                    errors.push(`Row ${rowNum}: Branch code '${branchShortCode}' not found for the selected program.`);
                    continue;
                }
                branchData = { bId: branchObj._id, deptId: branchObj.departmentId };
                branchCache[branchShortCode] = branchData;
            }
            const bId = branchData.bId;
            const rowDeptId = branchData.deptId;

            const sId = (studentid || "").trim();
            const sName = (studentname || "").trim();
            const subCode = (subjectcode || "").trim();
            const subName = (subjectname || "").trim();
            const eYear = (examyear || "").toString().trim();
            const rType = (resulttype || "REGULAR").toString().trim().toUpperCase();

            if (!sId || !subCode || !eYear) {
                errors.push(`Row ${rowNum}: Missing studentId, subjectCode, or examYear.`);
                continue;
            }

            // 4. Duplicate Prevention
            const duplicate = await StudentResult.findOne({
                studentId: sId,
                subjectCode: subCode,
                semester: semVal,
                semesterTypeId: semTypeId,
                academicYearId: ayId,
                departmentId: rowDeptId,
                programId: programId,
                examYear: eYear,
                resultType: rType
            });

            if (duplicate) {
                errors.push(`Row ${rowNum}: Result already exists. Skipping.`);
                continue;
            }

            let finalResult = "PASS";
            const gradeVal = (grade || "").trim().toUpperCase();
            if (gradeVal === "F") {
                finalResult = "FAIL";
            }

            let finalSubjectType = "THEORY";
            if (subjecttype) {
                const sTypeClean = subjecttype.toString().trim().toUpperCase();
                if (["THEORY", "PRACTICAL", "INTEGRATED"].includes(sTypeClean)) {
                    finalSubjectType = sTypeClean;
                }
            }

            results.push({
                studentId: sId,
                studentName: sName,
                subjectCode: subCode,
                subjectName: subName,
                subjectType: finalSubjectType,
                departmentId: rowDeptId,
                programId: programId,
                branchId: bId,
                academicYearId: ayId,
                semester: semVal,
                semesterTypeId: semTypeId,
                examYear: eYear,
                resultType: rType,
                grade: (grade || "").trim(),
                result: finalResult,
                sgpa: sgpa ? Number(sgpa) : 0,
                cgpa: cgpa ? Number(cgpa) : 0,
                uploadedBy: req.user.userId
            });
        }

        if (errors.length > 0) {
            return res.status(400).json({
                message: `Upload failed due to ${errors.length} error(s). Please fix the errors and try again.`,
                errors: errors
            });
        }

        if (results.length > 0) {
            await StudentResult.insertMany(results);
            
            // Only update Proctor Summaries if the upload contains REGULAR results
            const regularResults = results.filter(r => r.resultType.toUpperCase() === "REGULAR");
            if (regularResults.length > 0) {
                await updateProctorSummaries(regularResults);
            }
        }

        res.status(201).json({
            message: `Successfully processed ${rows.length} rows. Uploaded ${results.length} results.`,
            processed: results.length
        });

    } catch (error) {
        console.error("CSV Upload Error:", error);

        // If it's a validation error from parseCSV or validateHeaders, it's usually a 400
        const isValidationError = error.message.includes("columns") ||
            error.message.includes("Missing required") ||
            error.message.includes("header row");

        res.status(isValidationError ? 400 : 500).json({
            message: error.message || "An error occurred during upload."
        });
    }
};

const getResults = async (req, res) => {
    try {
        const { departmentId, academicYear, semester, programId, branchId, examYear, resultType, semesterTypeId } = req.query;
        const filter = {};
        if (departmentId) filter.departmentId = departmentId;
        if (academicYear) filter.academicYearId = academicYear;
        if (semesterTypeId) filter.semesterTypeId = semesterTypeId;
        if (programId) filter.programId = programId;
        if (branchId) filter.branchId = branchId;
        if (examYear) filter.examYear = examYear;
        if (resultType) filter.resultType = resultType;

        const results = await StudentResult.find(filter)
            .sort({ studentId: 1 })
            .populate("programId", "name")
            .populate("branchId", "name code")
            .populate("academicYearId", "year")
            .populate("semesterTypeId", "name")
            .lean();

        res.status(200).json(results);
    } catch (error) {
        console.error("Fetch Results Error:", error);
        res.status(500).json({ message: error.message || "An error occurred while fetching results." });
    }
};

const getProctorPassPercentage = async (req, res) => {
    try {
        const { facultyId, academicYear, semesterTypeId } = req.query;
 
        if (!facultyId || !academicYear || !semesterTypeId) {
            return res.status(400).json({ message: "facultyId, academicYear, and semesterTypeId are required." });
        }
 
        const summary = await ProctorSummary.findOne({
            proctorId: facultyId,
            academicYearId: academicYear,
            semesterTypeId: semesterTypeId
        });

        if (!summary) {
            return res.json({
                totalMappedStudents: 0,
                studentsAppeared: 0,
                studentsPassed: 0,
                passPercentage: 0
            });
        }

        res.json({
            totalMappedStudents: summary.totalMappedStudents,
            studentsAppeared: summary.studentsAppeared,
            studentsPassed: summary.studentsPassed,
            passPercentage: summary.passPercentage
        });

    } catch (error) {
        console.error("Proctor Pass Percentage Error:", error);
        res.status(500).json({ message: error.message || "An error occurred while calculating proctor percentage." });
    }
};

module.exports = {
    downloadTemplate,
    uploadCSV,
    getResults,
    getProctorPassPercentage
};
