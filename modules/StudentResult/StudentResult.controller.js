const StudentResult = require("./StudentResult.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const ProcterMaping = require("../ProcterMaping/ProcterMaping.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const ProctorSummary = require("../ProctorSummary/ProctorSummary.model");
const Student = require("../StudentData/Studentdata.model");

const convertRomanToNumber = (romanStr) => {
    if (!romanStr) return null;
    const roman = romanStr.toString().trim().split(" ")[0].toUpperCase();
    const romanMap = {
        "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10
    };
    return romanMap[roman] || Number(roman);
};

// @desc    Download CSV template
// @route   GET /api/student-results/template
const downloadTemplate = (req, res) => {
    const headers = [
        "studentid",
        "subjectcode",
        "subjectname",
        "semester",
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
        if (!uploadedResults || uploadedResults.length === 0) return;
        
        console.log(`[ProctorSummary] Starting update for ${uploadedResults.length} results/mappings`);
        
        const studentIds = [...new Set(uploadedResults.map(r => r.studentId))];
        const semesters = [...new Set(uploadedResults.map(r => r.semester?.toString()))].filter(Boolean);
        const numericSemesters = semesters.map(s => Number(s)).filter(s => !isNaN(s));

        console.log(`[ProctorSummary] Unique Students: ${studentIds.length}, Semesters: ${semesters}`);

        // 1. Find all affected proctor assignments
        const mappings = await ProcterMaping.find({
            studentId: { $in: studentIds },
            $or: [
                { semester: { $in: semesters } },
                { semester: { $in: numericSemesters } }
            ]
        });

        if (mappings.length === 0) {
            console.log(`[ProctorSummary] No proctor mappings found for these students in semesters ${semesters}`);
            return;
        }

        // Group by term (Proctor + Year + SemType)
        const termsToUpdate = {};
        mappings.forEach(m => {
            const key = `${m.proctorId}_${m.academicYearId}_${m.semesterTypeId}`;
            if (!termsToUpdate[key]) {
                termsToUpdate[key] = {
                    proctorId: m.proctorId,
                    proctorName: m.proctorName,
                    academicYearId: m.academicYearId,
                    semesterTypeId: m.semesterTypeId
                };
            }
        });

        console.log(`[ProctorSummary] Found ${Object.keys(termsToUpdate).length} proctor terms to recalculate`);

        for (const key in termsToUpdate) {
            const { proctorId, proctorName, academicYearId, semesterTypeId } = termsToUpdate[key];
            
            // Get ALL students assigned to this proctor for this specific term
            const allAssignments = await ProcterMaping.find({
                proctorId,
                academicYearId,
                semesterTypeId
            });

            const assignmentMap = {}; // studentId -> semester (string)
            allAssignments.forEach(a => {
                assignmentMap[a.studentId] = a.semester.toString();
            });

            const studentIdsForProctor = Object.keys(assignmentMap);

            // Fetch all REGULAR results for these students
            const allResults = await StudentResult.find({
                studentId: { $in: studentIdsForProctor },
                resultType: "REGULAR"
            });

            // Filter results that match the assigned semester
            const validResults = allResults.filter(r => {
                const mappedSem = assignmentMap[r.studentId];
                return mappedSem && r.semester.toString() === mappedSem;
            });

            // Calculate stats
            const appearedIds = new Set();
            const failedIds = new Set();

            validResults.forEach(r => {
                appearedIds.add(r.studentId);
                if (r.result?.toUpperCase() === "FAIL" || r.grade?.toUpperCase() === "F") {
                    failedIds.add(r.studentId);
                }
            });

            const totalMapped = studentIdsForProctor.length;
            const appeared = appearedIds.size;
            const failed = failedIds.size;
            const passed = appeared - failed;
            const passPercentage = appeared > 0 ? ((passed / appeared) * 100).toFixed(2) : 0;

            console.log(`[ProctorSummary] Updating Proctor ${proctorId} (${proctorName}): Mapped:${totalMapped}, Appeared:${appeared}, Passed:${passed}, %:${passPercentage}`);

            await ProctorSummary.findOneAndUpdate(
                { academicYearId, semesterTypeId, proctorId },
                {
                    $set: {
                        proctorName,
                        totalMappedStudents: totalMapped,
                        studentsAppeared: appeared,
                        studentsPassed: passed,
                        passPercentage: Number(passPercentage),
                        lastCalculatedAt: new Date()
                    }
                },
                { upsert: true, new: true }
            );
        }
        console.log(`[ProctorSummary] Recalculation complete`);
    } catch (error) {
        console.error("[ProctorSummary] Critical Error:", error);
    }
};

const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = [
            "studentid",
            "subjectcode",
            "subjectname",
            "semester",
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
        const studentCache = {};
        const programCache = {};
        const branchCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const {
                studentid,
                subjectcode,
                subjectname,
                semester,
                examyear,
                resulttype,
                grade,
                subjecttype,
                sgpa,
                cgpa
            } = row;

            const rowNum = i + 2;

            const sId = (studentid || "").trim();
            const subCode = (subjectcode || "").trim();
            const subName = (subjectname || "").trim();
            const eYear = (examyear || "").toString().trim();
            const rType = (resulttype || "REGULAR").toString().trim().toUpperCase();
            const rawSemVal = (semester || "").toString().trim().toUpperCase();

            if (!sId || !subCode || !eYear || !rawSemVal) {
                errors.push(`Row ${rowNum}: Missing studentid, subjectcode, semester, or examyear.`);
                continue;
            }

            const parsedSem = convertRomanToNumber(rawSemVal);
            if (!parsedSem || isNaN(parsedSem)) {
                errors.push(`Row ${rowNum}: Invalid semester format '${rawSemVal}'.`);
                continue;
            }
            const semVal = parsedSem.toString();

            // 1. Resolve Student to get name, department, program, branch
            let studentData = studentCache[sId];
            if (!studentData) {
                const studentObj = await Student.findOne({ rollNo: sId });
                if (!studentObj) {
                    errors.push(`Row ${rowNum}: Student with ID '${sId}' not found in the system.`);
                    continue;
                }
                studentData = {
                    name: studentObj.personalInfo?.studentName || "",
                    departmentId: studentObj.academicInfo?.department,
                    programName: studentObj.academicInfo?.programName,
                    branchCode: studentObj.academicInfo?.branch
                };
                studentCache[sId] = studentData;
            }

            if (!studentData.departmentId || !studentData.programName || !studentData.branchCode) {
                errors.push(`Row ${rowNum}: Student '${sId}' is missing academic info (department, program, or branch).`);
                continue;
            }

            // Resolve Program ID
            let pId = programCache[studentData.programName];
            if (!pId) {
                const pObj = await Program.findOne({ name: studentData.programName });
                if (!pObj) {
                    errors.push(`Row ${rowNum}: Program '${studentData.programName}' not found in the system.`);
                    continue;
                }
                pId = pObj._id;
                programCache[studentData.programName] = pId;
            }

            // Resolve Branch ID
            const branchKey = `${pId}_${studentData.branchCode}`;
            let bId = branchCache[branchKey];
            if (!bId) {
                const bObj = await Branch.findOne({ programId: pId, code: studentData.branchCode });
                if (!bObj) {
                    errors.push(`Row ${rowNum}: Branch '${studentData.branchCode}' not found for program '${studentData.programName}'.`);
                    continue;
                }
                bId = bObj._id;
                branchCache[branchKey] = bId;
            }

            // 2. Duplicate Prevention
            const duplicate = await StudentResult.findOne({
                studentId: sId,
                subjectCode: subCode,
                semester: semVal,
                examYear: eYear,
                resultType: rType
            });

            if (duplicate) {
                errors.push(`Row ${rowNum}: Result already exists. Skipping.`);
                continue;
            }

            let finalResult = "PASS";
            const gradeVal = (grade || "").trim().toUpperCase();
            if (gradeVal === "F" || gradeVal === "ABSENT") {
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
                studentName: studentData.name,
                subjectCode: subCode,
                subjectName: subName,
                subjectType: finalSubjectType,
                departmentId: studentData.departmentId,
                programId: pId,
                branchId: bId,
                semester: semVal,
                examYear: eYear,
                resultType: rType,
                grade: (grade || "").trim(),
                result: finalResult,
                sgpa: sgpa ? Number(sgpa) : 0,
                cgpa: cgpa ? Number(cgpa) : 0,
                uploadedBy: req.user?.userId || null
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
                // Wait for background process so any failure doesn't go unnoticed and doesn't get killed
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
        const { departmentId, semester, programId, branchId, examYear, resultType } = req.query;
        const filter = {};
        if (departmentId) filter.departmentId = departmentId;
        if (semester) filter.semester = semester;
        if (programId) filter.programId = programId;
        if (branchId) filter.branchId = branchId;
        if (examYear) filter.examYear = examYear;
        if (resultType) filter.resultType = resultType;

        const results = await StudentResult.find(filter)
            .sort({ studentId: 1 })
            .populate("programId", "name")
            .populate("branchId", "name code")
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
 
        if (!facultyId || !academicYear) {
            return res.status(400).json({ message: "facultyId and academicYear are required." });
        }
 
        const matchQuery = {
            proctorId: facultyId,
            academicYearId: academicYear
        };

        if (semesterTypeId) {
            matchQuery.semesterTypeId = semesterTypeId;
        }

        const summaries = await ProctorSummary.find(matchQuery).populate("semesterTypeId", "name");

        if (summaries.length === 0) {
            return res.json({
                totalMappedStudents: 0,
                studentsAppeared: 0,
                studentsPassed: 0,
                passPercentage: 0,
                details: []
            });
        }

        let totalMappedStudents = 0;
        let studentsAppeared = 0;
        let studentsPassed = 0;

        const details = summaries.map(s => {
            totalMappedStudents += s.totalMappedStudents;
            studentsAppeared += s.studentsAppeared;
            studentsPassed += s.studentsPassed;
            
            return {
                semesterName: s.semesterTypeId?.name || "Unknown",
                totalMappedStudents: s.totalMappedStudents,
                studentsAppeared: s.studentsAppeared,
                studentsPassed: s.studentsPassed,
                passPercentage: s.passPercentage
            };
        });

        const passPercentage = studentsAppeared > 0 ? ((studentsPassed / studentsAppeared) * 100).toFixed(2) : 0;

        res.json({
            totalMappedStudents,
            studentsAppeared,
            studentsPassed,
            passPercentage: Number(passPercentage),
            details
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
    getProctorPassPercentage,
    updateProctorSummaries // Exporting for use in ProcterMaping
};
