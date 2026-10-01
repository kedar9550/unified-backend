const jwt = require("jsonwebtoken");
const axios = require("axios");
const ServiceDeskStudent = require("./serviceDeskStudent.model");
const Employee = require("../employee/employee.model");
const Student = require("../StudentData/Studentdata.model");
const { fetchStudentFromEcap } = require("../../utils/ecapService");

// Mask Mobile Utility (e.g., 9392356314 -> ******6314)
const maskMobile = (mobile) => {
  if (!mobile) return "";
  const str = String(mobile).trim();
  if (str.length <= 4) return str;
  return `******${str.substring(str.length - 4)}`;
};

/**
 * @desc   Check Student Roll Number in ECAP & Send OTP
 * @route  POST /api/campus-service-request/auth/send-otp
 * @access Public
 */
exports.sendStudentOtp = async (req, res, next) => {
  try {
    const { rollno } = req.body;

    if (!rollno || !rollno.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter your Student Roll Number"
      });
    }

    const cleanRoll = String(rollno).trim().toUpperCase();

    // 1. Fetch live student record from ECAP API
    let ecapData = null;
    try {
      ecapData = await fetchStudentFromEcap(cleanRoll);
    } catch (ecapErr) {
      console.error(`[Student Auth] ECAP Error for ${cleanRoll}:`, ecapErr.message);
    }

    if (!ecapData) {
      return res.status(404).json({
        success: false,
        message: `Roll Number '${cleanRoll}' not found in University ECAP records.`
      });
    }

    // Extract student fields from ECAP response (handling varied casing)
    const studentStatus = (
      ecapData.studentstatus ||
      ecapData.StudentStatus ||
      ecapData.status ||
      ""
    ).trim();

    const studentName = (
      ecapData.studentname ||
      ecapData.StudentName ||
      "Student"
    ).trim();

    const mobileNumber = String(
      ecapData.mobilenumber ||
      ecapData.MobileNumber ||
      ecapData.phone ||
      ecapData.mothermobilenumber ||
      ecapData.fathermobilenumber ||
      ""
    ).trim();

    const courseName = (ecapData.coursename || ecapData.CourseName || "").trim();
    const branch = (ecapData.branch || ecapData.Branch || "").trim();
    const gender = (ecapData.gender || ecapData.Gender || "").trim();

    // 2. Check if student already exists in our database
    const existingStudent = await ServiceDeskStudent.findOne({ rollno: cleanRoll });

    // 3. Strict Check: ONLY 'Regular' status students can access
    const isRegular = studentStatus.toLowerCase() === "regular";

    if (!isRegular) {
      // If student was previously saved in DB, update status and deactivate
      if (existingStudent) {
        existingStudent.studentstatus = studentStatus || "Not Regular";
        existingStudent.isActive = false;
        await existingStudent.save();
        console.log(`[Student Auth] Updated existing student ${cleanRoll} status to '${studentStatus}' and deactivated.`);
      }

      return res.status(403).json({
        success: false,
        message: `Access Restricted: Service requests are only enabled for Regular students. Your current status in university records is '${studentStatus || "Inactive"}'.`
      });
    }

    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: "No registered mobile number found in university records. Please contact student affairs."
      });
    }

    // 4. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // 5. Save/Update in DB based on whether student already exists or is new
    if (existingStudent) {
      // Existing student: update latest details and set active
      existingStudent.studentname = studentName;
      existingStudent.studentstatus = "Regular";
      existingStudent.mobilenumber = mobileNumber;
      existingStudent.coursename = courseName;
      existingStudent.branch = branch;
      existingStudent.gender = gender;
      existingStudent.isActive = true;
      existingStudent.otp = otp;
      existingStudent.otpExpiry = otpExpiry;
      await existingStudent.save();
    } else {
      // New student: create new record with pending OTP verification
      await ServiceDeskStudent.create({
        rollno: cleanRoll,
        studentname: studentName,
        studentstatus: "Regular",
        mobilenumber: mobileNumber,
        coursename: courseName,
        branch: branch,
        gender: gender,
        isActive: true,
        otp: otp,
        otpExpiry: otpExpiry
      });
    }

    // 6. Target Mobile for SMS (Allows dev override to 9550175369 for testing)
    const targetMobile = process.env.DEV_TEST_MOBILE || "9550175369" || mobileNumber;

    // 7. Send OTP via SMS
    const smsText = `Dear ${encodeURIComponent(studentName)},%0AYour+OTP+for+Campus+Service+Request+Portal+is+${otp}.+Valid+for+10+minutes.+@ADITYA+UNIVERSITY`;
    const smsUrl = `${process.env.SMS_API_URL}${targetMobile}&text=${smsText}`;

    console.log(`\n======================================================`);
    console.log(`🔑 [CAMPUS DESK OTP] Roll: ${cleanRoll} (${studentName})`);
    console.log(`📲 Target Mobile: ${targetMobile} (ECAP: ${mobileNumber})`);
    console.log(`⚡ GENERATED OTP: >>> ${otp} <<<`);
    console.log(`======================================================\n`);

    try {
      console.log(`[Student Auth] Sending OTP SMS to ${targetMobile} for roll ${cleanRoll}...`);
      const smsResponse = await axios.get(smsUrl, { timeout: 8000 });
      if (smsResponse.status === 200) {
        console.log(`[Student Auth] SMS sent successfully to ${targetMobile}`);
      }
    } catch (smsErr) {
      console.error(`[Student Auth] SMS Gateway error:`, smsErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to ${maskMobile(targetMobile)}`,
      data: {
        rollno: cleanRoll,
        studentname: studentName,
        maskedMobile: maskMobile(targetMobile),
        branch: branch,
        coursename: courseName,
        // Provided during development for instant testing convenience
        ...(process.env.NODE_ENV === "development" ? { devOtp: otp } : {})
      }
    });

  } catch (error) {
    console.error("[Student Auth] Error in sendStudentOtp:", error);
    next(error);
  }
};

/**
 * @desc   Verify OTP & Issue 7-Day Student Session Token
 * @route  POST /api/campus-service-request/auth/verify-otp
 * @access Public
 */
exports.verifyStudentOtp = async (req, res, next) => {
  try {
    const { rollno, otp, fcmToken } = req.body;

    if (!rollno || !otp) {
      return res.status(400).json({
        success: false,
        message: "Roll Number and OTP are required"
      });
    }

    const cleanRoll = String(rollno).trim().toUpperCase();
    const cleanOtp = String(otp).trim();

    // Check if student exists in database
    const student = await ServiceDeskStudent.findOne({ rollno: cleanRoll });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student record not found. Please request an OTP first."
      });
    }

    if (!student.isActive || student.studentstatus !== "Regular") {
      return res.status(403).json({
        success: false,
        message: "Account is inactive or status is not Regular."
      });
    }

    // Verify OTP & Expiry
    if (!student.otp || student.otp !== cleanOtp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please check the 6-digit code sent to your mobile."
      });
    }

    if (new Date() > new Date(student.otpExpiry)) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one."
      });
    }

    // Clear OTP after successful verification & record login timestamp
    student.otp = null;
    student.otpExpiry = null;
    student.lastLoginAt = new Date();

    // Disassociate FCM token from any employee or previous user to prevent mixed push notifications
    if (fcmToken) {
      student.fcmIds = [...new Set([...(student.fcmIds || []), fcmToken])];
      try {
        await Employee.updateMany(
          { fcmIds: fcmToken },
          { $pull: { fcmIds: fcmToken } }
        );
        await Student.updateMany(
          { fcmIds: fcmToken },
          { $pull: { fcmIds: fcmToken } }
        );
      } catch (err) {
        console.error("[Student Auth] Error pulling FCM from Employee/Student:", err);
      }
    }

    await student.save();

    // Clear employee/staff session cookie if present on the browser
    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProd,
      sameSite: "none",
      path: "/"
    });

    // Generate JWT token with 7-Day (1 Week) Expiry
    const token = jwt.sign(
      {
        studentId: student._id,
        rollno: student.rollno,
        studentname: student.studentname,
        role: "STUDENT",
        isStudent: true
      },
      process.env.JWT_SECRET || "ganesha_varahidevi_m_kedars",
      { expiresIn: "7d" } // 1 Week Session
    );

    return res.status(200).json({
      success: true,
      message: "Authentication successful",
      token,
      student: {
        _id: student._id,
        rollno: student.rollno,
        studentname: student.studentname,
        studentstatus: student.studentstatus,
        mobilenumber: student.mobilenumber,
        coursename: student.coursename,
        branch: student.branch,
        gender: student.gender
      }
    });

  } catch (error) {
    console.error("[Student Auth] Error in verifyStudentOtp:", error);
    next(error);
  }
};

/**
 * @desc   Get Current Student Profile from Valid Token
 * @route  GET /api/campus-service-request/auth/me
 * @access Student Auth Required
 */
exports.getStudentProfile = async (req, res, next) => {
  try {
    if (!req.student) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    return res.status(200).json({
      success: true,
      student: {
        _id: req.student._id,
        rollno: req.student.rollno,
        studentname: req.student.studentname,
        studentstatus: req.student.studentstatus,
        mobilenumber: req.student.mobilenumber,
        coursename: req.student.coursename,
        branch: req.student.branch,
        gender: req.student.gender
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Clear staff/employee session cookie when accessing campus desk
 * @route  POST /api/campus-service-request/auth/clear-staff-session
 * @access Public
 */
exports.clearStaffSession = async (req, res, next) => {
  try {
    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProd,
      sameSite: "none",
      path: "/"
    });
    return res.status(200).json({ success: true, message: "Staff session cookie cleared" });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Logout student & Remove FCM Token
 * @route  POST /api/campus-service-request/auth/logout
 * @access Public
 */
exports.logoutStudent = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    const studentId = req.student?._id;

    if (fcmToken) {
      if (studentId) {
        await ServiceDeskStudent.findByIdAndUpdate(studentId, {
          $pull: { fcmIds: fcmToken }
        }).catch(err => console.error("[Student Auth] Error pulling FCM by studentId:", err));
      }
      await ServiceDeskStudent.updateMany(
        { fcmIds: fcmToken },
        { $pull: { fcmIds: fcmToken } }
      ).catch(err => console.error("[Student Auth] Error pulling FCM by token:", err));
    }

    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProd,
      sameSite: "none",
      path: "/"
    });

    return res.status(200).json({
      success: true,
      message: "Student logged out and device token removed successfully"
    });
  } catch (error) {
    console.error("[Student Auth] Error in logoutStudent:", error);
    next(error);
  }
};
