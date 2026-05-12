const Employee = require('../employee/employee.model');
const Student = require('../StudentData/Studentdata.model');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Mask Email Utility
const maskEmail = (email) => {
    if (!email) return "";
    const [user, domain] = email.split("@");
    if (user.length <= 2) return `${user[0]}***@${domain}`;
    return `${user.substring(0, 2)}***${user.substring(user.length - 2)}@${domain}`;
};

// @desc    Check if Employee/Student exists and return masked email
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
        let email = "";

        if (!user) {
            // Check Student
            user = await Student.findOne({ rollNo: employeeCode.toUpperCase() });
            userType = "Student";
            if (user) email = user.contactInfo?.emailId;
        } else {
            email = user.email;
        }

        if (!user) {
            return res.status(404).json({ success: false, message: "ID not found" });
        }

        if (!email) {
            return res.status(400).json({ success: false, message: "No email associated with this ID. Please contact admin." });
        }

        res.status(200).json({
            success: true,
            message: `ID valid. OTP will be sent to ${maskEmail(email)}`,
            email: email, // Optionally send the full email if frontend needs it for the next step
            userType
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Send OTP to email
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOtp = async (req, res, next) => {
    try {
        const { employeeCode, email } = req.body;

        if (!employeeCode || !email) {
            return res.status(400).json({ success: false, message: "ID and Email are required" });
        }

        // Find user
        let user = await Employee.findOne({ institutionId: employeeCode, email });
        let userType = "Employee";

        if (!user) {
            user = await Student.findOne({ rollNo: employeeCode.toUpperCase(), "contactInfo.emailId": email });
            userType = "Student";
        }

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found or email mismatch" });
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

        // Send Email
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Password Reset OTP',
            text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`
        };

        // In development, we might not have real credentials, so we log it
        if (process.env.NODE_ENV === 'development' && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
            console.log(`[AUTH] EMAIL SIMULATION - To: ${email}, OTP: ${otp}`);
        } else {
            try {
                console.log(`[AUTH] Attempting to send email to ${email}...`);
                await transporter.sendMail(mailOptions);
                console.log(`[AUTH] Email sent successfully to ${email}`);
            } catch (mailError) {
                console.error(`[AUTH] Error sending email: ${mailError.message}`);
                return res.status(500).json({ success: false, message: "Error sending OTP email. Please check server logs." });
            }
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
