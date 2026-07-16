const Employee = require('../employee/employee.model');
const Student = require('../StudentData/Studentdata.model');
const crypto = require('crypto');
const axios = require('axios');

// Mask Mobile Utility
const maskMobile = (mobile) => {
    if (!mobile) return "";
    const str = String(mobile);
    if (str.length <= 4) return str;
    return `******${str.substring(str.length - 4)}`;
};

// @desc    Check if Employee/Student exists and return masked mobile
// @route   POST /api/auth/check-employee
// @access  Public
exports.checkEmployee = async (req, res, next) => {
    try {
        const { employeeCode } = req.body;

        if (!employeeCode) {
            return res.status(400).json({ success: false, message: "Please provide an ID" });
        }

        // Check Employee
        let user = await Employee.findOne({ institutionId: employeeCode });
        let userType = "Employee";
        let mobile = "";

        if (!user) {
            // Check Student
            user = await Student.findOne({ rollNo: employeeCode.toUpperCase() });
            userType = "Student";
            if (user) mobile = user.contactInfo?.mobileNumber;
        } else {
            mobile = user.phone;
        }

        if (!user) {
            return res.status(404).json({ success: false, message: "ID not found" });
        }

        if (!mobile) {
            return res.status(400).json({ success: false, message: "No mobile number associated with this ID. Please contact admin." });
        }

        res.status(200).json({
            success: true,
            message: "ID valid. OTP will be sent to " + maskMobile(mobile),
            mobile: mobile,
            userType
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Send OTP to mobile
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOtp = async (req, res, next) => {
    try {
        const { employeeCode, mobile, email } = req.body;

        // Accept mobile or fallback to email (if frontend still sends 'email' key)
        const contactValue = mobile || email;

        if (!employeeCode || !contactValue) {
            return res.status(400).json({ success: false, message: "ID and Mobile Number are required" });
        }

        // Find user
        let user = await Employee.findOne({ institutionId: employeeCode, phone: contactValue });
        let userType = "Employee";

        if (!user) {
            user = await Student.findOne({ rollNo: employeeCode.toUpperCase(), "contactInfo.mobileNumber": contactValue });
            userType = "Student";
        }

        // Fallback for old frontend behavior
        if (!user) {
            user = await Employee.findOne({ institutionId: employeeCode, email: contactValue });
            if (!user) {
                user = await Student.findOne({ rollNo: employeeCode.toUpperCase(), "contactInfo.emailId": contactValue });
                userType = "Student";
            }
            if (user) {
                return res.status(400).json({ success: false, message: "Please provide the registered mobile number, not email." });
            }
        }

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found or mobile mismatch" });
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        // Save OTP to user
        if (userType === "Employee") {
            user.otp = otp;
            user.otpExpiry = otpExpiry;
        } else {
            user.system.otp = otp;
            user.system.otpExpiry = otpExpiry;
        }
        await user.save();

        // Send Mobile SMS
        const name = user.name || (userType === "Student" ? user.studentName : "User");
        const smsApiUrl = process.env.SMS_API_URL + contactValue + "&text=Dear+" + encodeURIComponent(name) + ",%0AThank+you+for+reaching+out+to+us.+%0ATo+verify+your+request+and+proceed+with+further+actions,+please+use+the+following+One-Time+Password+(OTP):" + otp + "+@ADITYA+UNIVERSITY";

        try {
            console.log("[AUTH] Attempting to send SMS to " + contactValue + "...");
            const response = await axios.get(smsApiUrl);
            if (response.status === 200) {
                console.log("[AUTH] SMS sent successfully to " + contactValue);
            } else {
                return res.status(400).json({ success: false, message: "Failed to send OTP SMS." });
            }
        } catch (smsError) {
            console.error("[AUTH] Error sending SMS: " + smsError.message);
            return res.status(500).json({ success: false, message: "Error sending OTP SMS. Please check server logs." });
        }

        res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
        next(error);
    }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOtp = async (req, res, next) => {
    try {
        const { employeeCode, otp } = req.body;

        if (!employeeCode || !otp) {
            return res.status(400).json({ success: false, message: "ID and OTP are required" });
        }

        let user = await Employee.findOne({ institutionId: employeeCode });
        let userType = "Employee";

        if (!user) {
            user = await Student.findOne({ rollNo: employeeCode.toUpperCase() });
            userType = "Student";
        }

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const userOtp = userType === "Employee" ? user.otp : user.system.otp;
        const userOtpExpiry = userType === "Employee" ? user.otpExpiry : user.system.otpExpiry;

        if (!userOtp || userOtp !== otp || userOtpExpiry < new Date()) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        res.status(200).json({ success: true, message: "OTP verified successfully" });
    } catch (error) {
        next(error);
    }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
    try {
        const { employeeCode, otp, newPassword } = req.body;

        if (!employeeCode || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        let user = await Employee.findOne({ institutionId: employeeCode });
        let userType = "Employee";

        if (!user) {
            user = await Student.findOne({ rollNo: employeeCode.toUpperCase() });
            userType = "Student";
        }

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const userOtp = userType === "Employee" ? user.otp : user.system.otp;
        const userOtpExpiry = userType === "Employee" ? user.otpExpiry : user.system.otpExpiry;

        if (!userOtp || userOtp !== otp || userOtpExpiry < new Date()) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        // Update password
        if (userType === "Employee") {
            user.password = newPassword;
            user.otp = undefined;
            user.otpExpiry = undefined;
        } else {
            user.system.password = newPassword;
            user.system.otp = undefined;
            user.system.otpExpiry = undefined;
        }

        await user.save();

        res.status(200).json({ success: true, message: "Password reset successfully" });
    } catch (error) {
        next(error);
    }
};
