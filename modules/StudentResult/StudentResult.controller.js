const StudentResult = require("./StudentResult.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const ProctorMapping = require("../ProctorMapping/ProctorMapping.model");
const { parseCSV, validateHeaders } = require("../../utils/csvParser");
const ProctorSummary = require("../ProctorSummary/ProctorSummary.model");
const SemesterType = require("../semesterType/semesterType.model");
const AcademicYear = require("../academicYear/academicYear.model");
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


const isYearName = (val) => {
    if (!val) return false;
    return /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\s+Year$/i.test(val.trim());
};

const getSemesterTypeName = (semNumber) => {
    const n = parseInt(semNumber);
    if (isNaN(n)) return null;
    return n % 2 !== 0 ? "ODD" : "EVEN";
};


let _semTypeCache = null;

const getSemTypeCache = async () => {
    if (_semTypeCache) return _semTypeCache;
    const types = await SemesterType.find({ isActive: true });
    _semTypeCache = {};
    types.forEach(t => { _semTypeCache[t.name] = t._id; });
    // e.g. { ODD: ObjectId(...), EVEN: ObjectId(...), SUMMER: ObjectId(...), YEAR: ObjectId(...) }
    return _semTypeCache;
};

// ── AcademicYear Cache ────────────────────────────────────────────────────────
// label string → ObjectId
let _ayCache = null;

const getAYCache = async () => {
    if (_ayCache) return _ayCache;
    const years = await AcademicYear.find();
    _ayCache = {};
    years.forEach(y => { _ayCache[y.year] = y._id; });
    // e.g. { "2023-2024": ObjectId(...), "2024-2025": ObjectId(...) }
    return _ayCache;
};

// ── Download CSV Templates ────────────────────────────────────────────────────

const downloadTemplate = (req, res) => {
    const headers = [
        "studentid", "subjectcode", "subjectname",
        "semester", "examyear", "resulttype",
        "grade", "subjecttype", "sgpa", "cgpa"
    ];
    const sampleRow = ["STU001", "CS101", "Data Structures", "1", "2025", "REGULAR", "A", "THEORY", "9.0", "8.5"];
    const csvContent = headers.join(",") + "\n" + sampleRow.join(",") + "\n";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=student_result_template_sem.csv");
    res.status(200).send(csvContent);
};

const downloadYearTemplate = (req, res) => {
    const headers = [
        "studentid", "subjectcode", "subjectname",
        "yearname", "examyear", "resulttype",
        "subjecttype", "intmarks", "extmarks",
        "totalmarks", "maxmarks"
    ];
    const sampleRow = ["PH001", "PH101", "Human Anatomy", "I Year", "2025", "REGULAR", "THEORY", "26", "39", "65", "100"];
    const csvContent = headers.join(",") + "\n" + sampleRow.join(",") + "\n";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=student_result_template_year.csv");
    res.status(200).send(csvContent);
};

// ── Proctor for Period Resolution ─────────────────────────────────────────────

/**
 * Resolve which proctor was active for a student during a specific period.
 * 
 * @param {Object}  mapping      - ProctorMapping document
 * @param {String}  targetAY     - Target Academic Year (e.g. "2024-2025")
 * @param {String}  periodLabel  - Semester number string ("1", "2"...) or Year Name ("I Year"...)
 * @param {Boolean} isYear       - true if Pharma.D
 * @param {Number|null} semNum   - actual semester number for SEM programs
 */
const resolveProctorForPeriod = (mapping, targetAY, periodLabel, isYear, semNum) => {
    if (!isYear) {
        // SEM program
        if (semNum) {
            // 1. Check history for exact semester + year match
            const hist = mapping.history.find(h =>
                h.fromSemester === semNum &&
                h.fromAcademicYear === targetAY
            );
            if (hist) {
                return {
                    proctorId: hist.proctorId,
                    proctorName: hist.proctorName,
                    academicYear: hist.fromAcademicYear
                };
            }

            // 2. Check if current assignment covers this period
            // Current proctor is active if (targetAY, semNum) >= (fromAcademicYear, fromSemester)
            // Comparison: Year first, then semester
            const isAfterStart = (targetAY > mapping.fromAcademicYear) || 
                                 (targetAY === mapping.fromAcademicYear && (mapping.fromSemester === null || semNum >= mapping.fromSemester));

            if (isAfterStart) {
                return {
                    proctorId: mapping.currentProctorId,
                    proctorName: mapping.currentProctorName,
                    academicYear: mapping.fromAcademicYear
                };
            }
        } else {
            // No semNum provided (fallback)
            const assignedSemType = getSemesterTypeName(mapping.fromSemester);
            const targetSemType = periodLabel; // Assuming "ODD"/"EVEN" passed here
            if (assignedSemType === targetSemType && targetAY >= mapping.fromAcademicYear) {
                return {
                    proctorId: mapping.currentProctorId,
                    proctorName: mapping.currentProctorName,
                    academicYear: mapping.fromAcademicYear
                };
            }
        }
    } else {
        // YEAR program (Pharma.D)
        // 1. Check history
        const hist = mapping.history.find(h => 
            h.fromYearName === periodLabel && 
            h.fromAcademicYear === targetAY
        );
        if (hist) {
            return {
                proctorId: hist.proctorId,
                proctorName: hist.proctorName,
                academicYear: hist.fromAcademicYear
            };
        }

        // 2. Check current
        const requestedVal = convertRomanToNumber(periodLabel);
        const assignedVal = convertRomanToNumber(mapping.fromYearName);
        
        const isAfterStart = (targetAY > mapping.fromAcademicYear) ||
                             (targetAY === mapping.fromAcademicYear && (!assignedVal || requestedVal >= assignedVal));

        if (isAfterStart) {
            return {
                proctorId: mapping.currentProctorId,
                proctorName: mapping.currentProctorName,
                academicYear: mapping.fromAcademicYear
            };
        }
    }

    return { proctorId: null, proctorName: null, academicYear: null };
};

const updateProctorSummaries = async (uploadedResults) => {
    try {
        if (!uploadedResults || uploadedResults.length === 0) return;

        console.log(`[ProctorSummary] Starting for ${uploadedResults.length} REGULAR results`);

        // ── 1. Load caches ───────────────────────────────────────────────────
        const semTypeCache = await getSemTypeCache();
        // { ODD: ObjectId, EVEN: ObjectId, SUMMER: ObjectId, YEAR: ObjectId }

        const ayCache = await getAYCache();
        // { "2023-2024": ObjectId, "2024-2025": ObjectId, … }

        // ── 2. Load proctor mappings for uploaded students ───────────────────
        const studentIds = [...new Set(uploadedResults.map(r => r.studentId))];
        const mappings = await ProctorMapping.find({ studentId: { $in: studentIds } });

        if (mappings.length === 0) {
            console.log(`[ProctorSummary] No proctor mappings found — skipping`);
            return;
        }

        const mappingByStudent = {};
        mappings.forEach(m => { mappingByStudent[m.studentId] = m; });

        // ── 3. Build buckets ─────────────────────────────────────────────────
        //
        //  One bucket = one ProctorSummary record (one upsert).
        //
        //  periodLabel:
        //    SEM  programs → exact semester string  e.g. "1", "3", "5"
        //    YEAR programs → yearName string         e.g. "I Year", "II Year"
        //
        //  academicYear comes directly from ProctorMapping — no examYear needed.
        //
        const buckets = {};

        for (const result of uploadedResults) {
            const mapping = mappingByStudent[result.studentId];
            if (!mapping) continue;

            const isYear = !!result.yearName;
            let semTypeName, periodLabel, semNum;

            if (isYear) {
                // ── Pharma.D ─────────────────────────────────────────────────
                semTypeName = "YEAR";
                periodLabel = result.yearName.trim();   // "I Year", "II Year" …
                semNum = null;
            } else {
                // ── SEM program ──────────────────────────────────────────────
                const rawSem = (result.semester || "").toString().trim();

                // Skip SUMMER semesters (e.g. "25S", "25s") — no proctor summary
                if (/^\d+[sS]$/.test(rawSem)) continue;

                semNum = parseInt(rawSem);
                if (isNaN(semNum)) continue;

                semTypeName = semNum % 2 !== 0 ? "ODD" : "EVEN";
                periodLabel = semNum.toString();        // "1", "2", "3" …
            }

            if (!semTypeCache[semTypeName]) {
                console.log(`[ProctorSummary] semType '${semTypeName}' not in DB — skipping`);
                continue;
            }

            const semesterTypeId = semTypeCache[semTypeName];

            // ── Resolve proctor from mapping ────────────────────────────────
            // We use the examYear or current context to determine the target academic year.
            // Since we're processing uploaded results, we assume the target year is the mapping's year 
            // or we use the mapping to see if they are the current proctor.
            const { proctorId, proctorName, academicYear } = resolveProctorForPeriod(
                mapping, mapping.fromAcademicYear, periodLabel, isYear, semNum
            );

            if (!proctorId || !academicYear) continue;

            const academicYearId = ayCache[academicYear];
            if (!academicYearId) {
                console.log(`[ProctorSummary] AcademicYear '${academicYear}' not in DB — skipping`);
                continue;
            }

            // ── Bucket key ───────────────────────────────────────────────────
            const bucketKey = `${proctorId}||${academicYear}||${semTypeName}||${periodLabel}`;

            if (!buckets[bucketKey]) {
                buckets[bucketKey] = {
                    proctorId,
                    proctorName,
                    academicYear,       // e.g. "2024-2025"
                    academicYearId,     // ObjectId
                    semTypeName,        // "ODD" | "EVEN" | "YEAR"
                    semesterTypeId,     // ObjectId
                    periodLabel,        // "1" | "3" | "I Year" …
                    isYear
                };
            }
        }

        console.log(`[ProctorSummary] ${Object.keys(buckets).length} bucket(s) to process`);

        // ── 4. Process each bucket ───────────────────────────────────────────
        for (const key of Object.keys(buckets)) {
            const {
                proctorId, proctorName,
                academicYear, academicYearId,
                semTypeName, semesterTypeId,
                periodLabel, isYear
            } = buckets[key];

            const semNumForResolve = isYear ? null : parseInt(periodLabel);

            // ── 4a. Find ALL students mapped to this proctor for this period ─
            //  Scan all ProctorMapping docs, resolveProctorForPeriod for each.
            //  totalMapped = students whose proctor for this period = proctorId
            //                AND academicYear matches.
            const allMappings = await ProctorMapping.find({});
            const mappedStudentIds = [];

            for (const m of allMappings) {
                const { proctorId: pid } = resolveProctorForPeriod(
                    m, academicYear, periodLabel, isYear, semNumForResolve
                );
                if (pid === proctorId) {
                    mappedStudentIds.push(m.studentId);
                }
            }

            const totalMapped = mappedStudentIds.length;
            if (totalMapped === 0) {
                console.log(`[ProctorSummary] No mapped students for ${proctorId} | ${academicYear} | ${periodLabel} — skipping`);
                continue;
            }

            // ── 4b. Fetch REGULAR results for mapped students ────────────────
            //  Filter by exact semester OR exact yearName.
            //  No examYear filter — mapping's academicYear is the source of truth.
            //  resultType: "REGULAR" only (SUPPLY results excluded).
            const resultFilter = {
                studentId: { $in: mappedStudentIds },
                resultType: "REGULAR"
            };

            if (isYear) {
                resultFilter.yearName = periodLabel;        // "I Year"
            } else {
                resultFilter.semester = periodLabel;        // "3"  (exact)
            }

            const periodResults = await StudentResult.find(resultFilter);

            // ── 4c. Aggregate per student ────────────────────────────────────
            //  appeared → student has at least 1 result
            //  passed   → ALL subjects PASS
            //  failed   → ANY subject FAIL
            const resultsByStudent = {};
            for (const r of periodResults) {
                if (!resultsByStudent[r.studentId]) resultsByStudent[r.studentId] = [];
                resultsByStudent[r.studentId].push(r);
            }

            let appeared = 0, passed = 0, failed = 0;

            for (const studentResults of Object.values(resultsByStudent)) {
                appeared++;
                const hasAnyFail = studentResults.some(r => r.result === "FAIL");
                if (hasAnyFail) failed++;
                else passed++;
            }

            const passPercentage = appeared > 0
                ? parseFloat(((passed / appeared) * 100).toFixed(2))
                : 0;

            console.log(
                `[ProctorSummary] ${proctorId} | ${academicYear} | ${semTypeName} | ${periodLabel}` +
                ` → Mapped=${totalMapped}, Appeared=${appeared}, Passed=${passed}, Failed=${failed}, Pass%=${passPercentage}`
            );

            // ── 4d. Upsert ProctorSummary ────────────────────────────────────
            await ProctorSummary.findOneAndUpdate(
                { proctorId, academicYearId, semesterTypeId, periodLabel },
                {
                    $set: {
                        proctorName,
                        totalMappedStudents: totalMapped,
                        studentsAppeared: appeared,
                        studentsPassed: passed,
                        studentsFailed: failed,
                        passPercentage,
                        lastCalculatedAt: new Date()
                    }
                },
                { upsert: true, new: true }
            );
        }

        console.log(`[ProctorSummary] Done ✓`);

    } catch (error) {
        console.error("[ProctorSummary] Error:", error);
    }
};

// ── SEM Program CSV Upload ────────────────────────────────────────────────────

const uploadCSV = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No CSV file uploaded" });

        const rows = parseCSV(req.file.buffer);
        validateHeaders(rows, [
            "studentid", "subjectcode", "subjectname",
            "semester", "examyear", "resulttype",
            "grade", "subjecttype", "sgpa", "cgpa"
        ]);

        const results = [];
        const errors = [];
        const studentCache = {}, programCache = {}, branchCache = {};

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
                errors.push(`Row ${rowNum}: Invalid semester '${rawSemVal}'.`);
                continue;
            }
            const semVal = parsedSem.toString();

            let studentData = studentCache[sId];
            if (!studentData) {
                const s = await Student.findOne({ rollNo: sId });
                if (!s) { errors.push(`Row ${rowNum}: Student '${sId}' not found.`); continue; }
                studentData = {
                    name: s.personalInfo?.studentName || "",
                    departmentId: s.academicInfo?.department,
                    programName: s.academicInfo?.programName,
                    branchCode: s.academicInfo?.branch
                };
                studentCache[sId] = studentData;
            }

            if (!studentData.departmentId || !studentData.programName || !studentData.branchCode) {
                errors.push(`Row ${rowNum}: Student '${sId}' missing dept/program/branch.`);
                continue;
            }

            let pId = programCache[studentData.programName];
            if (!pId) {
                const p = await Program.findOne({ name: studentData.programName });
                if (!p) { errors.push(`Row ${rowNum}: Program '${studentData.programName}' not found.`); continue; }
                pId = p._id;
                programCache[studentData.programName] = pId;
            }

            const bKey = `${pId}_${studentData.branchCode}`;
            let bId = branchCache[bKey];
            if (!bId) {
                const b = await Branch.findOne({ programId: pId, code: studentData.branchCode });
                if (!b) { errors.push(`Row ${rowNum}: Branch '${studentData.branchCode}' not found.`); continue; }
                bId = b._id;
                branchCache[bKey] = bId;
            }

            const duplicate = await StudentResult.findOne({
                studentId: sId, subjectCode: subCode,
                semester: semVal, yearName: null,
                examYear: eYear, resultType: rType
            });
            if (duplicate) {
                errors.push(`Row ${rowNum}: Result already exists for '${sId}', subject '${subCode}', sem ${semVal}.`);
                continue;
            }

            const gradeVal = (row.grade || "").trim().toUpperCase();
            const finalResult = (gradeVal === "F" || gradeVal === "ABSENT") ? "FAIL" : "PASS";

            let subjectType = "THEORY";
            if (row.subjecttype) {
                const st = row.subjecttype.toString().trim().toUpperCase();
                if (["THEORY", "PRACTICAL", "INTEGRATED"].includes(st)) subjectType = st;
            }

            results.push({
                studentId: sId,
                studentName: studentData.name,
                subjectCode: subCode,
                subjectName: subName,
                subjectType,
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
            return res.status(400).json({ message: `Upload failed: ${errors.length} error(s).`, errors });
        }

        if (results.length > 0) {
            await StudentResult.insertMany(results);


            const regularResults = results.filter(r => r.resultType === "REGULAR");
            if (regularResults.length > 0) {
                await updateProctorSummaries(regularResults);
            } else {
                console.log("[ProctorSummary] No REGULAR results — skipping summary update");
            }
        }

        res.status(201).json({ message: `Uploaded ${results.length} results.`, processed: results.length });

    } catch (error) {
        console.error("SEM CSV Upload Error:", error);
        const isVal = error.message?.includes("columns") || error.message?.includes("Missing") || error.message?.includes("header");
        res.status(isVal ? 400 : 500).json({ message: error.message || "Upload failed." });
    }
};

// ── YEAR Program CSV Upload (Pharma.D) ────────────────────────────────────────

const uploadYearCSV = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No CSV file uploaded" });

        const rows = parseCSV(req.file.buffer);
        validateHeaders(rows, [
            "studentid", "subjectcode", "subjectname",
            "yearname", "examyear", "resulttype",
            "subjecttype", "intmarks", "extmarks",
            "totalmarks", "maxmarks"
        ]);

        const results = [];
        const errors = [];
        const studentCache = {}, programCache = {}, branchCache = {};

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            const sId = (row.studentid || "").trim();
            const subCode = (row.subjectcode || "").trim();
            const subName = (row.subjectname || "").trim();
            const yearNameVal = (row.yearname || "").trim();
            const eYear = (row.examyear || "").toString().trim();
            const rType = (row.resulttype || "REGULAR").toString().trim().toUpperCase();

            if (!sId || !subCode || !yearNameVal || !eYear) {
                errors.push(`Row ${rowNum}: Missing studentid, subjectcode, yearname, or examyear.`);
                continue;
            }

            if (!isYearName(yearNameVal)) {
                errors.push(`Row ${rowNum}: Invalid yearname '${yearNameVal}'. Use "I Year", "II Year" etc.`);
                continue;
            }

            let studentData = studentCache[sId];
            if (!studentData) {
                const s = await Student.findOne({ rollNo: sId });
                if (!s) { errors.push(`Row ${rowNum}: Student '${sId}' not found.`); continue; }
                studentData = {
                    name: s.personalInfo?.studentName || "",
                    departmentId: s.academicInfo?.department,
                    programName: s.academicInfo?.programName,
                    branchCode: s.academicInfo?.branch
                };
                studentCache[sId] = studentData;
            }

            if (!studentData.departmentId || !studentData.programName || !studentData.branchCode) {
                errors.push(`Row ${rowNum}: Student '${sId}' missing dept/program/branch.`);
                continue;
            }

            let pId = programCache[studentData.programName];
            if (!pId) {
                const p = await Program.findOne({ name: studentData.programName });
                if (!p) { errors.push(`Row ${rowNum}: Program '${studentData.programName}' not found.`); continue; }
                pId = p._id;
                programCache[studentData.programName] = pId;
            }

            const bKey = `${pId}_${studentData.branchCode}`;
            let bId = branchCache[bKey];
            if (!bId) {
                const b = await Branch.findOne({ programId: pId, code: studentData.branchCode });
                if (!b) { errors.push(`Row ${rowNum}: Branch '${studentData.branchCode}' not found.`); continue; }
                bId = b._id;
                branchCache[bKey] = bId;
            }

            const intMarks = parseFloat(row.intmarks) || 0;
            const extMarks = parseFloat(row.extmarks) || 0;
            const totalMarks = parseFloat(row.totalmarks) || (intMarks + extMarks);
            const maxMarks = parseFloat(row.maxmarks) || 100;

            if (maxMarks <= 0) { errors.push(`Row ${rowNum}: maxmarks must be > 0.`); continue; }

            const finalResult = ((totalMarks / maxMarks) * 100) >= 50 ? "PASS" : "FAIL";

            let subjectType = "THEORY";
            if (row.subjecttype) {
                const st = row.subjecttype.toString().trim().toUpperCase();
                if (["THEORY", "PRACTICAL", "INTEGRATED"].includes(st)) subjectType = st;
            }

            const duplicate = await StudentResult.findOne({
                studentId: sId, subjectCode: subCode,
                semester: null, yearName: yearNameVal,
                examYear: eYear, resultType: rType
            });
            if (duplicate) {
                errors.push(`Row ${rowNum}: Result already exists for '${sId}', subject '${subCode}', ${yearNameVal}.`);
                continue;
            }

            results.push({
                studentId: sId,
                studentName: studentData.name,
                subjectCode: subCode,
                subjectName: subName,
                subjectType,
                departmentId: studentData.departmentId,
                programId: pId,
                branchId: bId,
                semester: null,
                yearName: yearNameVal,
                examYear: eYear,
                resultType: rType,
                grade: "",
                result: finalResult,
                intMarks, extMarks, totalMarks, maxMarks,
                sgpa: 0,
                cgpa: 0,
                uploadedBy: req.user?.userId || null
            });
        }

        if (errors.length > 0) {
            return res.status(400).json({ message: `Upload failed: ${errors.length} error(s).`, errors });
        }

        if (results.length > 0) {
            await StudentResult.insertMany(results);

            const regularResults = results.filter(r => r.resultType === "REGULAR");
            if (regularResults.length > 0) {
                await updateProctorSummaries(regularResults);
            } else {
                console.log("[ProctorSummary] No REGULAR results — skipping summary update");
            }
        }

        res.status(201).json({ message: `Uploaded ${results.length} results.`, processed: results.length });

    } catch (error) {
        console.error("YEAR CSV Upload Error:", error);
        const isVal = error.message?.includes("columns") || error.message?.includes("Missing") || error.message?.includes("header");
        res.status(isVal ? 400 : 500).json({ message: error.message || "Upload failed." });
    }
};

// ── Fetch Results ─────────────────────────────────────────────────────────────

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
        res.status(500).json({ message: error.message });
    }
};

// ── Proctor Pass Percentage ───────────────────────────────────────────────────

/**
 * @route GET /api/student-results/proctor-results
 * @query facultyId, academicYearId

 */
const getProctorPassPercentage = async (req, res) => {
    try {
        const { facultyId, academicYearId, academicYear } = req.query;

        if (!facultyId || (!academicYearId && !academicYear)) {
            return res.status(400).json({ message: "facultyId and (academicYearId or academicYear) are required." });
        }

        const query = { proctorId: facultyId };

        // AcademicYear is program-specific. We need to find all summaries sharing the same year string.
        if (academicYearId) {
            const ayDoc = await AcademicYear.findById(academicYearId);
            if (ayDoc) {
                const allAys = await AcademicYear.find({ year: ayDoc.year }).select("_id");
                query.academicYearId = { $in: allAys.map(y => y._id) };
            } else {
                query.academicYearId = academicYearId;
            }
        } else if (academicYear) {
            const allAys = await AcademicYear.find({ year: academicYear }).select("_id");
            query.academicYearId = { $in: allAys.map(y => y._id) };
        }

        const summaries = await ProctorSummary.find(query)
            .populate("semesterTypeId", "name")
            .sort({ periodLabel: 1 });

        if (summaries.length === 0) {
            return res.json({
                totalMappedStudents: 0,
                studentsAppeared: 0,
                studentsPassed: 0,
                studentsFailed: 0,
                passPercentage: 0,
                details: []
            });
        }

        let totalAppeared = 0, totalPassed = 0, totalFailed = 0, totalMapped = 0;

        const details = summaries.map(s => {
            totalAppeared += s.studentsAppeared;
            totalPassed += s.studentsPassed;
            totalFailed += s.studentsFailed;
            totalMapped += s.totalMappedStudents;

            return {
                semesterType: s.semesterTypeId?.name || "UNKNOWN",
                periodLabel: s.periodLabel,
                totalMappedStudents: s.totalMappedStudents,
                studentsAppeared: s.studentsAppeared,
                studentsPassed: s.studentsPassed,
                studentsFailed: s.studentsFailed,
                passPercentage: s.passPercentage
            };
        });

        const overallPassPercentage = totalAppeared > 0
            ? parseFloat(((totalPassed / totalAppeared) * 100).toFixed(2))
            : 0;

        res.json({
            totalMappedStudents: totalMapped,
            studentsAppeared: totalAppeared,
            studentsPassed: totalPassed,
            studentsFailed: totalFailed,
            passPercentage: overallPassPercentage,
            details
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ── Proctor Departments ───────────────────────────────────────────────────────

const getProctorDepartments = async (req, res) => {
    try {
        const { facultyId, academicYear } = req.query;

        if (!facultyId || !academicYear) {
            return res.status(400).json({ message: "facultyId and academicYear are required." });
        }

        const mappings = await ProctorMapping.find({
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
        res.status(500).json({ message: error.message });
    }
};

// ── Exports ───────────────────────────────────────────────────────────────────

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
