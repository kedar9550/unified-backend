const StudentResult = require("./StudentResult.model");
const AcademicYear = require("../academicYear/academicYear.model");
const SemesterType = require("../semesterType/semesterType.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const ProcterMaping = require("../ProcterMaping/ProcterMaping.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const ProctorSummary = require("../ProctorSummary/ProctorSummary.model");
const Student = require("../StudentData/Studentdata.model");
const Department = require("../academics/department.model");

// ── Helpers ──────────────────────────────────────────────────────────────────

const convertRomanToNumber = (romanStr) => {
    if (!romanStr) return null;
    const roman = romanStr.toString().trim().split(" ")[0].toUpperCase();
    const romanMap = {
        "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5,
        "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10
    };
    return romanMap[roman] || Number(roman);
};

// Detect if a "semester_or_year" value is a Pharma.D year name
// e.g. "I Year", "II Year", "III Year" etc.
const isYearName = (val) => {
    if (!val) return false;
    return /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\s+Year$/i.test(val.trim());
};

// ── Download CSV Templates ───────────────────────────────────────────────────

// @desc  Download SEM program CSV template
// @route GET /api/student-results/template
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
    const sampleRow = ["STU001", "CS101", "Data Structures", "1", "2025", "REGULAR", "A", "THEORY", "9.0", "8.5"];
    const csvContent = headers.join(",") + "\n" + sampleRow.join(",") + "\n";

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=student_result_template_sem.csv");
    res.status(200).send(csvContent);
};

// @desc  Download YEAR program CSV template (Pharma.D)
// @route GET /api/student-results/template-year
const downloadYearTemplate = (req, res) => {
    const headers = [
        "studentid",
        "subjectcode",
        "subjectname",
        "yearname",
        "examyear",
        "resulttype",
        "subjecttype",
        "intmarks",
        "extmarks",
        "totalmarks",
        "maxmarks"
    ];
    const sampleRow = ["PH001", "PH101", "Human Anatomy", "I Year", "2025", "REGULAR", "THEORY", "26", "39", "65", "100"];
    const csvContent = headers.join(",") + "\n" + sampleRow.join(",") + "\n";

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=student_result_template_year.csv");
    res.status(200).send(csvContent);
};

// ── Proctor Summary Recalculation ────────────────────────────────────────────

/**
 * Recalculates ProctorSummary records after a REGULAR result upload.
 *
 * Uses the CORRECT ProcterMaping field names:
 *   - currentProctorId   (not proctorId)
 *   - currentProctorName (not proctorName)
 *   - fromAcademicYear   (not academicYearId)
 *   - fromSemester       (for SEM programs)
 *   - fromYearName       (for YEAR programs like Pharma.D)
 *
 * ProctorSummary is keyed by (proctorId, fromAcademicYear, semOrYear).
 * Only REGULAR results count — SUPPLY results never affect this summary.
 */
const updateProctorSummaries = async (uploadedResults) => {
    try {
        if (!uploadedResults || uploadedResults.length === 0) return;

        console.log(`[ProctorSummary] Starting update for ${uploadedResults.length} results`);

        const studentIds = [...new Set(uploadedResults.map(r => r.studentId))];

        // Find all current proctor mappings for these students
        const mappings = await ProcterMaping.find({
            studentId: { $in: studentIds }
        });

        if (mappings.length === 0) {
            console.log(`[ProctorSummary] No proctor mappings found for these students`);
            return;
        }

        // Build a lookup: studentId -> mapping
        const studentMappingDict = {};
        mappings.forEach(m => {
            studentMappingDict[m.studentId] = m;
        });

        // Group into unique proctor+academicYear+period buckets
        // key = proctorId|academicYear|semOrYear
        const buckets = {};

        uploadedResults.forEach(r => {
            const mapping = studentMappingDict[r.studentId];
            if (!mapping) return;

            const proctorId = mapping.currentProctorId;
            const proctorName = mapping.currentProctorName;
            const academicYear = mapping.fromAcademicYear;

            // Determine the period label (semester number or year name)
            const periodLabel = r.yearName
                ? r.yearName                        // Pharma.D → "I Year"
                : (r.semester || "").toString();    // SEM program → "1", "2" etc.

            if (!proctorId || !academicYear || !periodLabel) return;

            const key = `${proctorId}|${academicYear}|${periodLabel}`;
            if (!buckets[key]) {
                buckets[key] = { proctorId, proctorName, academicYear, periodLabel };
            }
        });

        console.log(`[ProctorSummary] Buckets to recalculate: ${Object.keys(buckets).length}`);

        for (const key of Object.keys(buckets)) {
            const { proctorId, proctorName, academicYear, periodLabel } = buckets[key];

            // Find ALL students mapped to this proctor for this academic year
            const allMappings = await ProcterMaping.find({
                currentProctorId: proctorId,
                fromAcademicYear: academicYear
            });

            const mappedStudentIds = allMappings.map(m => m.studentId);

            if (mappedStudentIds.length === 0) continue;

            // Fetch ONLY REGULAR results for these students matching this period
            const isYear = isYearName(periodLabel);
            const resultFilter = {
                studentId: { $in: mappedStudentIds },
                resultType: "REGULAR"
            };

            if (isYear) {
                resultFilter.yearName = periodLabel;
            } else {
                resultFilter.semester = periodLabel;
            }

            const periodResults = await StudentResult.find(resultFilter);

            // Count unique students who appeared and who passed
            const appearedIds = new Set();
            const failedIds = new Set();

            periodResults.forEach(r => {
                appearedIds.add(r.studentId);
                if (r.result === "FAIL") {
                    failedIds.add(r.studentId);
                }
            });

            const totalMapped = mappedStudentIds.length;
            const appeared = appearedIds.size;
            const passed = appeared - failedIds.size;
            const passPercentage = appeared > 0
                ? parseFloat(((passed / appeared) * 100).toFixed(2))
                : 0;

            console.log(`[ProctorSummary] Proctor ${proctorId} | ${academicYear} | ${periodLabel}: Mapped=${totalMapped}, Appeared=${appeared}, Passed=${passed}, %=${passPercentage}`);

            // Upsert ProctorSummary
            // We use academicYear (string) + periodLabel + proctorId as the unique key
            await ProctorSummary.findOneAndUpdate(
                {
                    proctorId,
                    academicYearId: academicYear,   // stored as string here (the year label)
                    semesterTypeId: periodLabel      // re-used to store period label
                },
                {
                    $set: {
                        proctorName,
                        totalMappedStudents: totalMapped,
                        studentsAppeared: appeared,
                        studentsPassed: passed,
                        passPercentage,
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

// ── SEM Program CSV Upload ───────────────────────────────────────────────────

// @desc  Upload SEM-based student results CSV
// @route POST /api/student-results/upload
const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = [
            "studentid", "subjectcode", "subjectname",
            "semester", "examyear", "resulttype",
            "grade", "subjecttype", "sgpa", "cgpa"
        ];

        validateHeaders(rows, requiredHeaders);

        const results = [];
        const errors = [];

        const studentCache = {};
        const programCache = {};
        const branchCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            const sId = (row.studentid || "").trim();
            const subCode = (row.subjectcode || "").trim();
            const subName = (row.subjectname || "").trim();
            const eYear = (row.examyear || "").toString().trim();
            const rType = (row.resulttype || "REGULAR").toString().trim().toUpperCase();
            const rawSemVal = (row.semester || "").toString().trim();

            if (!sId || !subCode || !eYear || !rawSemVal) {
                errors.push(`Row ${rowNum}: Missing studentid, subjectcode, semester, or examyear.`);
                continue;
            }

            const parsedSem = convertRomanToNumber(rawSemVal);
            if (!parsedSem || isNaN(parsedSem)) {
                errors.push(`Row ${rowNum}: Invalid semester format '${rawSemVal}'. Use a number (1,2,3...) or Roman numeral (I,II,III...).`);
                continue;
            }
            const semVal = parsedSem.toString();

            // Resolve student
            let studentData = studentCache[sId];
            if (!studentData) {
                const studentObj = await Student.findOne({ rollNo: sId });
                if (!studentObj) {
                    errors.push(`Row ${rowNum}: Student '${sId}' not found.`);
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
                errors.push(`Row ${rowNum}: Student '${sId}' is missing department/program/branch info.`);
                continue;
            }

            // Resolve program
            let pId = programCache[studentData.programName];
            if (!pId) {
                const pObj = await Program.findOne({ name: studentData.programName });
                if (!pObj) {
                    errors.push(`Row ${rowNum}: Program '${studentData.programName}' not found.`);
                    continue;
                }
                pId = pObj._id;
                programCache[studentData.programName] = pId;
            }

            // Resolve branch
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

            // Duplicate check
            const duplicate = await StudentResult.findOne({
                studentId: sId,
                subjectCode: subCode,
                semester: semVal,
                yearName: null,
                examYear: eYear,
                resultType: rType
            });
            if (duplicate) {
                errors.push(`Row ${rowNum}: Result already exists for student '${sId}', subject '${subCode}', semester ${semVal}. Skipping.`);
                continue;
            }

            // Grade → result
            const gradeVal = (row.grade || "").trim().toUpperCase();
            const finalResult = (gradeVal === "F" || gradeVal === "ABSENT") ? "FAIL" : "PASS";

            // Subject type
            let finalSubjectType = "THEORY";
            if (row.subjecttype) {
                const st = row.subjecttype.toString().trim().toUpperCase();
                if (["THEORY", "PRACTICAL", "INTEGRATED"].includes(st)) finalSubjectType = st;
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
                yearName: null,
                examYear: eYear,
                resultType: rType,
                grade: (row.grade || "").trim(),
                result: finalResult,
                sgpa: row.sgpa ? Number(row.sgpa) : 0,
                cgpa: row.cgpa ? Number(row.cgpa) : 0,
                uploadedBy: req.user?.userId || null
            });
        }

        if (errors.length > 0) {
            return res.status(400).json({
                message: `Upload failed due to ${errors.length} error(s). Please fix and retry.`,
                errors
            });
        }

        if (results.length > 0) {
            await StudentResult.insertMany(results);
            const regularResults = results.filter(r => r.resultType === "REGULAR");
            if (regularResults.length > 0) {
                await updateProctorSummaries(regularResults);
            }
        }

        res.status(201).json({
            message: `Successfully uploaded ${results.length} results.`,
            processed: results.length
        });

    } catch (error) {
        console.error("SEM CSV Upload Error:", error);
        const isValidationError = error.message?.includes("columns") ||
            error.message?.includes("Missing required") ||
            error.message?.includes("header row");
        res.status(isValidationError ? 400 : 500).json({
            message: error.message || "An error occurred during upload."
        });
    }
};

// ── YEAR Program CSV Upload (Pharma.D) ───────────────────────────────────────

// @desc  Upload YEAR-based (marks) student results CSV — for Pharma.D etc.
// @route POST /api/student-results/upload-year
const uploadYearCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No CSV file uploaded" });
        }

        const rows = parseCSV(req.file.buffer);
        const requiredHeaders = [
            "studentid", "subjectcode", "subjectname",
            "yearname", "examyear", "resulttype",
            "subjecttype", "intmarks", "extmarks",
            "totalmarks", "maxmarks"
        ];

        validateHeaders(rows, requiredHeaders);

        const results = [];
        const errors = [];

        const studentCache = {};
        const programCache = {};
        const branchCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            const sId = (row.studentid || "").trim();
            const subCode = (row.subjectcode || "").trim();
            const subName = (row.subjectname || "").trim();
            const yearNameVal = (row.yearname || "").trim();   // e.g. "I Year"
            const eYear = (row.examyear || "").toString().trim();
            const rType = (row.resulttype || "REGULAR").toString().trim().toUpperCase();

            if (!sId || !subCode || !yearNameVal || !eYear) {
                errors.push(`Row ${rowNum}: Missing studentid, subjectcode, yearname, or examyear.`);
                continue;
            }

            // Validate yearname format
            if (!isYearName(yearNameVal)) {
                errors.push(`Row ${rowNum}: Invalid yearname '${yearNameVal}'. Use format like "I Year", "II Year", "III Year" etc.`);
                continue;
            }

            // Resolve student
            let studentData = studentCache[sId];
            if (!studentData) {
                const studentObj = await Student.findOne({ rollNo: sId });
                if (!studentObj) {
                    errors.push(`Row ${rowNum}: Student '${sId}' not found.`);
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
                errors.push(`Row ${rowNum}: Student '${sId}' is missing department/program/branch info.`);
                continue;
            }

            // Resolve program
            let pId = programCache[studentData.programName];
            if (!pId) {
                const pObj = await Program.findOne({ name: studentData.programName });
                if (!pObj) {
                    errors.push(`Row ${rowNum}: Program '${studentData.programName}' not found.`);
                    continue;
                }
                pId = pObj._id;
                programCache[studentData.programName] = pId;
            }

            // Resolve branch
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

            // Parse marks
            const intMarks = parseFloat(row.intmarks) || 0;
            const extMarks = parseFloat(row.extmarks) || 0;
            const totalMarks = parseFloat(row.totalmarks) || (intMarks + extMarks);
            const maxMarks = parseFloat(row.maxmarks) || 100;

            if (maxMarks <= 0) {
                errors.push(`Row ${rowNum}: maxmarks must be greater than 0.`);
                continue;
            }

            // PASS / FAIL based on marks percentage ≥ 50%
            const percentage = (totalMarks / maxMarks) * 100;
            const finalResult = percentage >= 50 ? "PASS" : "FAIL";

            // Subject type
            let finalSubjectType = "THEORY";
            if (row.subjecttype) {
                const st = row.subjecttype.toString().trim().toUpperCase();
                if (["THEORY", "PRACTICAL", "INTEGRATED"].includes(st)) finalSubjectType = st;
            }

            // Duplicate check
            const duplicate = await StudentResult.findOne({
                studentId: sId,
                subjectCode: subCode,
                semester: null,
                yearName: yearNameVal,
                examYear: eYear,
                resultType: rType
            });
            if (duplicate) {
                errors.push(`Row ${rowNum}: Result already exists for student '${sId}', subject '${subCode}', ${yearNameVal}. Skipping.`);
                continue;
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
                semester: null,
                yearName: yearNameVal,
                examYear: eYear,
                resultType: rType,
                grade: "",          // No grade for marks-based system
                result: finalResult,
                intMarks,
                extMarks,
                totalMarks,
                maxMarks,
                sgpa: 0,
                cgpa: 0,
                uploadedBy: req.user?.userId || null
            });
        }

        if (errors.length > 0) {
            return res.status(400).json({
                message: `Upload failed due to ${errors.length} error(s). Please fix and retry.`,
                errors
            });
        }

        if (results.length > 0) {
            await StudentResult.insertMany(results);
            const regularResults = results.filter(r => r.resultType === "REGULAR");
            if (regularResults.length > 0) {
                await updateProctorSummaries(regularResults);
            }
        }

        res.status(201).json({
            message: `Successfully uploaded ${results.length} results.`,
            processed: results.length
        });

    } catch (error) {
        console.error("YEAR CSV Upload Error:", error);
        const isValidationError = error.message?.includes("columns") ||
            error.message?.includes("Missing required") ||
            error.message?.includes("header row");
        res.status(isValidationError ? 400 : 500).json({
            message: error.message || "An error occurred during upload."
        });
    }
};

// ── Fetch Results ────────────────────────────────────────────────────────────

// @desc  Get results with optional filters
// @route GET /api/student-results
const getResults = async (req, res) => {
    try {
        const { departmentId, semester, yearName, programId, branchId, examYear, resultType } = req.query;
        const filter = {};
        if (departmentId) filter.departmentId = departmentId;
        if (semester) filter.semester = semester;
        if (yearName) filter.yearName = yearName;
        if (programId) filter.programId = programId;
        if (branchId) filter.branchId = branchId;
        if (examYear) filter.examYear = examYear;
        if (resultType) filter.resultType = resultType;

        const results = await StudentResult.find(filter)
            .sort({ studentId: 1 })
            .populate("programId", "name programPattern")
            .populate("branchId", "name code")
            .lean();

        res.status(200).json(results);
    } catch (error) {
        console.error("Fetch Results Error:", error);
        res.status(500).json({ message: error.message || "An error occurred while fetching results." });
    }
};

// ── Proctor Pass Percentage ──────────────────────────────────────────────────

// @desc  Get pass percentage for a proctor's mapped students
// @route GET /api/student-results/proctor-results
const getProctorPassPercentage = async (req, res) => {
    try {
        const { facultyId, academicYear } = req.query;

        if (!facultyId || !academicYear) {
            return res.status(400).json({ message: "facultyId and academicYear are required." });
        }

        // Find all ProctorSummary records for this proctor + academic year
        const summaries = await ProctorSummary.find({
            proctorId: facultyId,
            academicYearId: academicYear
        });

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
                periodLabel: s.semesterTypeId || "Unknown",  // semesterTypeId stores the period label
                totalMappedStudents: s.totalMappedStudents,
                studentsAppeared: s.studentsAppeared,
                studentsPassed: s.studentsPassed,
                passPercentage: s.passPercentage
            };
        });

        const passPercentage = studentsAppeared > 0
            ? parseFloat(((studentsPassed / studentsAppeared) * 100).toFixed(2))
            : 0;

        res.json({
            totalMappedStudents,
            studentsAppeared,
            studentsPassed,
            passPercentage,
            details
        });

    } catch (error) {
        console.error("Proctor Pass Percentage Error:", error);
        res.status(500).json({ message: error.message || "An error occurred." });
    }
};

// ── Proctor Departments ──────────────────────────────────────────────────────

// @desc  Get departments for a proctor's mapped students
// @route GET /api/student-results/proctor-departments
const getProctorDepartments = async (req, res) => {
    try {
        const { facultyId, academicYear } = req.query;

        if (!facultyId || !academicYear) {
            return res.status(400).json({ message: "facultyId and academicYear are required." });
        }

        // Use correct ProcterMaping field names
        const mappings = await ProcterMaping.find({
            currentProctorId: facultyId,
            fromAcademicYear: academicYear
        }).select("studentId");

        const studentIds = mappings.map(m => m.studentId);

        if (studentIds.length === 0) return res.json([]);

        const students = await Student.find({ rollNo: { $in: studentIds } })
            .select("academicInfo.department");

        const deptIds = [...new Set(
            students.map(s => s.academicInfo?.department?.toString()).filter(Boolean)
        )];

        if (deptIds.length === 0) return res.json([]);

        const departments = await Department.find({ _id: { $in: deptIds } }).select("name _id");
        res.json(departments);

    } catch (error) {
        console.error("Fetch Proctor Departments Error:", error);
        res.status(500).json({ message: error.message || "An error occurred." });
    }
};

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    downloadTemplate,
    downloadYearTemplate,
    uploadCSV,
    uploadYearCSV,
    getResults,
    getProctorPassPercentage,
    getProctorDepartments,
    updateProctorSummaries
};
