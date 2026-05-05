const axios = require("axios");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const Department = require("../academics/department.model");

const EXTERNAL_API_URL = "https://info.aec.edu.in/adityaapi/api/studentdata";

/**
 * Fetch student data from external eCap API
 */
const fetchStudentDataFromAPI = async (rollNo) => {
  try {
    const response = await axios.get(`${EXTERNAL_API_URL}/${rollNo}`);
    if (Array.isArray(response.data) && response.data.length > 0) {
      const studentData = response.data[0];
      // Check if it's an actual student record, not an error object like [{"Message": "Not found"}]
      if (studentData && studentData.rollno) {
        return studentData;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error fetching student data for ${rollNo}:`, error.message);
    throw new Error(`Failed to fetch data for ${rollNo}`);
  }
};

/**
 * Convert Roman numeral semester string to Number
 * Handles:
 *   "I Semester"   → 1
 *   "VIII Semester" → 8
 *   "2/4 Semester-II" → 4
 *
 * Returns null for Pharma.D year strings like "I Year", "II Year"
 */
const convertSemesterToNumber = (semesterStr) => {
  if (!semesterStr) return null;

  const str = semesterStr.trim().toUpperCase();

  // Case 1: "VIII Semester", "I Semester" etc.
  const romanMatch = str.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X)\s+SEMESTER$/);
  if (romanMatch) {
    const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    return romanMap[romanMatch[1]];
  }

  // Case 2: "2/4 Semester-II"
  const complexMatch = str.match(/^(\d+)\/\d+\s+SEMESTER-(I|II|III|IV)$/);
  if (complexMatch) {
    const year = parseInt(complexMatch[1]);
    const romanMap = { I: 1, II: 2, III: 3, IV: 4 };
    const semInYear = romanMap[complexMatch[2]];
    return (year - 1) * 2 + semInYear;
  }

  // Pharma.D: "I Year", "II Year" etc. → return null (not a semester number)
  return null;
};

/**
 * Detect semType from eCap semestername field
 *
 * Rules:
 *   "I Year" / "II Year" etc.    → { semType: "YEAR", yearName: "I Year", semester: null }
 *   "I Semester" / "III Semester" → ODD  (1,3,5,7)
 *   "II Semester" / "IV Semester" → EVEN (2,4,6,8)
 *   null / unrecognized           → { semType: null, yearName: null, semester: null }
 *
 * Note: SUMMER is NOT derived from eCap API — it is set manually by admin
 *       when activating the summer semester in AcademicYear settings.
 *       eCap never returns "Summer Semester" — so we don't handle it here.
 */
const resolveSemFields = (semesterStr) => {
  if (!semesterStr) {
    return { semester: null, semType: null, yearName: null };
  }

  const str = semesterStr.trim().toUpperCase();

  // Pharma.D year pattern: "I YEAR", "II YEAR", "III YEAR" etc.
  const yearPattern = /^(I|II|III|IV|V|VI)\s+YEAR$/;
  if (yearPattern.test(str)) {
    return {
      semester: null,
      semType: "YEAR",
      yearName: semesterStr.trim()  // preserve original case: "I Year"
    };
  }

  // Regular semester number
  const semNum = convertSemesterToNumber(semesterStr);
  if (semNum !== null) {
    return {
      semester: semNum,
      semType: semNum % 2 !== 0 ? "ODD" : "EVEN",
      yearName: null
    };
  }

  // Unrecognized
  return { semester: null, semType: null, yearName: null };
};

/**
 * Parse Semester Results string from eCap
 * Example: "Sem11:76.35, Sem12:80.1"
 */
const parseSemesterResults = (semesterResultString) => {
  if (!semesterResultString) return [];

  const results = [];
  const parts = semesterResultString.split(",");
  const semMapping = {
    "SEM11": 1, "SEM12": 2,
    "SEM21": 3, "SEM22": 4,
    "SEM31": 5, "SEM32": 6,
    "SEM41": 7, "SEM42": 8
  };

  for (const part of parts) {
    if (!part.includes(":")) {
      if (part.trim()) {
        results.push({ semKey: part.trim() });
      }
      continue;
    }

    const [semKey, percentageStr] = part.split(":");
    if (semKey && percentageStr) {
      const formattedKey = semKey.trim().toUpperCase();
      const semesterNumber = semMapping[formattedKey];
      if (semesterNumber) {
        results.push({ semester: semesterNumber, percentage: parseFloat(percentageStr) });
      } else {
        // Fallback for unmapped formats like Pharma.D
        results.push({ semKey: semKey.trim(), percentage: parseFloat(percentageStr) || 0 });
      }
    }
  }
  return results;
};

/**
 * Transform external eCap data to our internal Student schema
 */
const transformStudentData = async (externalData, defaultPassword) => {
  const normalizeStatus = (status) => {
    if (!status) return "Regular";
    const s = status.trim();
    if (s.toLowerCase() === "alumini") return "Alumni";
    return s;
  };

  const normalizeSeatType = (seatType) => {
    if (!seatType) return "Convener";
    const s = seatType.trim().toUpperCase();
    if (s === "CONVENOR" || s === "CONVENER") return "Convener";
    if (s === "MANAGEMENT") return "Management";
    if (s === "FOREIGN-NATION") return "foreign-nation";
    return seatType.trim();
  };

  const studentStatus = normalizeStatus(externalData.studentstatus);
  const isActive = studentStatus === "Regular";

  const programName = externalData.coursename ? externalData.coursename.trim() : null;
  const branchName = externalData.branch ? externalData.branch.trim() : null;

  if (!programName || !branchName) {
    throw new Error(`ECAP API is missing 'coursename' or 'branch' for student ${externalData.rollno || 'Unknown'}. Received Program: '${programName}', Branch: '${branchName}'`);
  }

  const programExists = await Program.findOne({ name: new RegExp(`^${programName}$`, "i") });
  const branchExists = await Branch.findOne({ name: new RegExp(`^${branchName}$`, "i") });

  // ── Resolve semester fields ──────────────────────────────────────
  // eCap field: externalData.semestername
  // Examples:
  //   "I Semester"  → semester: 1, semType: "ODD",  yearName: null
  //   "IV Semester" → semester: 4, semType: "EVEN", yearName: null
  //   "I Year"      → semester: null, semType: "YEAR", yearName: "I Year"  (Pharma.D)
  const { semester, semType, yearName } = resolveSemFields(externalData.semestername);
  // ────────────────────────────────────────────────────────────────

  return {
    rollNo: externalData.rollno,
    personalInfo: {
      studentName: externalData.studentname,
      gender: externalData.gender,
      dateOfBirth: externalData.dateofbirth,
      bloodGroup: externalData.bloodgroup,
      nationality: externalData.nationality,
      religion: externalData.religion,
      motherTongue: externalData.mothertongue,
      category: externalData.category,
      casteName: externalData.castename
    },
    academicInfo: {
      programName: programExists ? programExists.name : null,
      branch: branchExists ? branchExists.name : branchName,
      semester,        // Number or null
      semType,         // "ODD"|"EVEN"|"YEAR"|null
      yearName,        // "I Year"|"II Year"|... or null
      joinedBatch: parseInt(externalData.joinedbatch) || null,
      academicBatch: parseInt(externalData.acadamicbatch) || null,
      joinedYear: externalData.joinedyear || "",
      relievedYear: externalData.relievedyear || "",
      studentStatus: studentStatus,
      entranceType: externalData.entrancetype || "",
      seatType: normalizeSeatType(externalData.seattype),
      eamcetHallTicketNumber: externalData.eamcethallticket || "",
      eamcetRank: parseInt(externalData.eamcetrank) || null,
      backlogs: parseInt(externalData.backlogs) || 0,
      overallPercent: parseFloat(externalData.overallpercent) || 0,
      semesterResults: parseSemesterResults(externalData.semesterresult)
    },
    contactInfo: {
      mobileNumber: externalData.mobilenumber || "0000000000",
      emailId: externalData.emailid || `${externalData.rollno.toLowerCase()}@aec.edu.in`,
      address: {
        doorNo: externalData.doorno,
        street: externalData.street,
        village: externalData.village,
        mandal: externalData.mandal,
        district: externalData.district,
        stateName: externalData.state,
        country: externalData.country
      }
    },
    parentInfo: {
      fatherName: externalData.fathername,
      fatherOccupation: externalData.fatheroccupation,
      fatherMobileNumber: externalData.fathermobilenumber,
      fatherEmailId: externalData.fatheremailid,
      motherOccupation: externalData.motheroccupation,
      motherMobileNumber: externalData.mothermobilenumber,
      motherEmailId: externalData.motheremailid
    },
    education: {
      ssc: {
        hallTicket: externalData.sschtno,
        board: externalData.sscboard,
        yearOfPass: parseInt(externalData.sscyearofpass) || null,
        maxMarks: parseFloat(externalData.sscmaxmarks) || null,
        obtainedMarks: parseFloat(externalData.sscobtained) || null,
        institution: externalData.sscinstitution,
        gradePoints: parseFloat(externalData.sscgradepoints) || null
      },
      intermediate: {
        hallTicket: externalData.interhtno,
        board: externalData.interboard,
        yearOfPass: parseInt(externalData.interyearofpass) || null,
        maxMarks: parseFloat(externalData.intermaxmarks) || null,
        obtainedMarks: parseFloat(externalData.interobtained) || null,
        institution: externalData.interinstitution,
        gradePoints: parseFloat(externalData.intergradepoints) || null
      },
      diploma: {
        hallTicket: externalData.diplomahtno,
        board: externalData.diplomaboard,
        yearOfPass: parseInt(externalData.diplomayearofpass) || null,
        maxMarks: parseFloat(externalData.diplomamaxmarks) || null,
        obtainedMarks: parseFloat(externalData.diplomaobtained) || null,
        institution: externalData.diplomainstitution
      },
      degree: {
        hallTicket: externalData.degreehtno,
        board: externalData.degreeboard,
        yearOfPass: parseInt(externalData.degreeyearofpass) || null,
        maxMarks: parseFloat(externalData.degreemaxmarks) || null,
        obtainedMarks: parseFloat(externalData.degreeobtained) || null,
        institution: externalData.degreeinstitution
      }
    },
    system: {
      isActive: isActive,
      password: defaultPassword
    }
  };
};

module.exports = {
  fetchStudentDataFromAPI,
  transformStudentData,
  resolveSemFields  // exported for use in other modules if needed
};
