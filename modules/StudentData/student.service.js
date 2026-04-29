const axios = require("axios");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const Department = require("../academics/department.model");

const EXTERNAL_API_URL = "https://info.aec.edu.in/adityaapi/api/studentdata";

/**
 * Fetch student data from external API
 */
const fetchStudentDataFromAPI = async (rollNo) => {
  try {
    const response = await axios.get(`${EXTERNAL_API_URL}/${rollNo}`);
    if (response.data && response.data.length > 0) {
      return response.data[0]; // Assuming it returns an array of student data
    }
    return null;
  } catch (error) {
    console.error(`Error fetching student data for ${rollNo}:`, error.message);
    throw new Error(`Failed to fetch data for ${rollNo}`);
  }
};

/**
 * Convert Roman numeral semester to Number
 */
const convertRomanToNumber = (romanStr) => {
  if (!romanStr) return null;
  const roman = romanStr.split(" ")[0].toUpperCase();
  const romanMap = {
    "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10
  };
  return romanMap[roman] || null;
};

/**
 * Parse Semester Results
 * Example: "Sem11:76.35, Sem12:80.1" -> [{ semester: 1, percentage: 76.35 }, { semester: 2, percentage: 80.1 }]
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
    const [semKey, percentageStr] = part.split(":");
    if (semKey && percentageStr) {
      const formattedKey = semKey.trim().toUpperCase();
      const semesterNumber = semMapping[formattedKey];
      if (semesterNumber) {
        results.push({
          semester: semesterNumber,
          percentage: parseFloat(percentageStr)
        });
      }
    }
  }
  return results;
};

/**
 * Transform external data to internal schema
 */
const transformStudentData = async (externalData, defaultPassword) => {
  // 1. Normalize simple values
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

  // 2. Validate Program & Branch
  const programName = externalData.coursename ? externalData.coursename.trim() : null;
  const branchName = externalData.branch ? externalData.branch.trim() : null;

  if (!programName || !branchName) {
    throw new Error("Missing Program or Branch in API response");
  }

  const programExists = await Program.findOne({ name: new RegExp(`^${programName}$`, "i") });
  const branchExists = await Branch.findOne({ name: new RegExp(`^${branchName}$`, "i") });

  // 3. Map Fields
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
      branch: branchExists ? branchExists.name : null,
      semester: convertRomanToNumber(externalData.semestername),
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
        hallTicket: externalData.sschallticket,
        board: externalData.sscboard,
        yearOfPass: parseInt(externalData.sscyearofpass) || null,
        maxMarks: parseFloat(externalData.sscmaxmarks) || null,
        obtainedMarks: parseFloat(externalData.sscobtainedmarks) || null,
        institution: externalData.sscinstitution,
        gradePoints: parseFloat(externalData.sscgradepoints) || null
      },
      intermediate: {
        hallTicket: externalData.interhallticket,
        board: externalData.interboard,
        yearOfPass: parseInt(externalData.interyearofpass) || null,
        maxMarks: parseFloat(externalData.intermaxmarks) || null,
        obtainedMarks: parseFloat(externalData.interobtainedmarks) || null,
        institution: externalData.interinstitution,
        gradePoints: parseFloat(externalData.intergradepoints) || null
      },
      diploma: {
        hallTicket: externalData.diplomahallticket,
        board: externalData.diplomaboard,
        yearOfPass: parseInt(externalData.diplomayearofpass) || null,
        maxMarks: parseFloat(externalData.diplomamaxmarks) || null,
        obtainedMarks: parseFloat(externalData.diplomaobtainedmarks) || null,
        institution: externalData.diplomainstitution
      },
      degree: {
        hallTicket: externalData.degreehallticket,
        board: externalData.degreeboard,
        yearOfPass: parseInt(externalData.degreeyearofpass) || null,
        maxMarks: parseFloat(externalData.degreemaxmarks) || null,
        obtainedMarks: parseFloat(externalData.degreeobtainedmarks) || null,
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
  transformStudentData
};
