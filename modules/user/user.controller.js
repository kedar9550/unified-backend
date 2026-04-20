const UserModel = require('./user.model');
const User = UserModel;
const Role = require('../role/role.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const authService = require('../../utils/authService');
const generateToken = require('../../utils/generateToken');
const sendOtpSms = require('../../utils/smsService');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { parseCSV, validateHeaders } = require('../../utils/csvParser');

const isProd = process.env.NODE_ENV === 'production';

const registerUser = async (req, res) => {
    try {

        const {
            fullname, id, department, designation,
            email, phone, password, userType
        } = req.body;

        if (!fullname || !id || !department || !designation ||
            !email || !phone || !password || !userType) {
            return res.status(400).json({
                message: "All fields required"
            });
        }

        const existingInstitution = await UserModel.findOne({
            institutionId: id
        });

        if (existingInstitution) {
            return res.status(409).json({
                message: "User with this ID already exists"
            });
        }

        const existingEmail = await UserModel.findOne({
            email: email.toLowerCase()
        });

        if (existingEmail) {
            return res.status(409).json({
                message: "Email is already registered"
            });
        }

        // Verify Identity with Institute API (Persona Check)
        try {
            let identityResponse;

            if (userType === "Employee") {
                identityResponse = await axios.get(
                    `https://info.aec.edu.in/adityaAPI/API/staffdata/${id}`
                );
            } else if (userType === "Student") {
                identityResponse = await axios.get(
                    `https://info.aec.edu.in/adityaapi/api/studentdata/${id}`
                );
            }

            const identityData = identityResponse?.data?.[0];

            if (!identityData || identityData.error) {
                return res.status(404).json({
                    message: `Invalid ${userType} ID. Not found in ECAP`
                });
            }

            // Strict Data Matching
            if (userType === "Employee") {
                const ecapName = (identityData.employeename || identityData.EmployeeName)?.trim().toLowerCase();
                const ecapDesignation = (identityData.designation || identityData.Designation || identityData.DesignationName)?.trim();

                if (ecapName && ecapName !== fullname.trim().toLowerCase()) {
                    return res.status(400).json({
                        message: "Name does not match Institute records"
                    });
                }

                if (ecapDesignation && ecapDesignation.toLowerCase() !== designation.trim().toLowerCase()) {
                    return res.status(400).json({
                        message: `Designation does not match Institute records. Expected: ${ecapDesignation}`
                    });
                }
            } else if (userType === "Student") {
                const ecapName = (identityData.studentname || identityData.StudentName)?.trim().toLowerCase();
                const ecapBranch = (identityData.branch || identityData.Branch)?.trim();

                if (ecapName && ecapName !== fullname.trim().toLowerCase()) {
                    return res.status(400).json({
                        message: "Name does not match Institute records"
                    });
                }

                if (ecapBranch && ecapBranch.toLowerCase() !== department.trim().toLowerCase()) {
                    return res.status(400).json({
                        message: `Department/Branch does not match Institute records. Expected: ${ecapBranch}`
                    });
                }
            }

        } catch (apiErr) {
            console.error("ECAP ERROR:", apiErr.message);

            return res.status(500).json({
                message: "ECAP verification failed. Try again later."
            });
        }

        // Create User
        const user = await UserModel.create({
            name: fullname,
            institutionId: id,
            department,
            designation,
            email,
            phone,
            password,
            userType
        });

        const appName = process.env.APP_NAME || "UNIFIED_SYSTEM";

        let roleName = "STUDENT";
        if (userType === "Employee") {
            const checkDesig = (designation || "").toLowerCase();
            if (/prof|professor|ass|teaching|ph\.?d\.?\s*full[- ]?time\s*scholar/i.test(checkDesig)) {
                roleName = "FACULTY";
            }
            else if (/technician|programmer/i.test(checkDesig)) {
                roleName = "TECHNICIAN";
            }
            else {
                roleName = "STAFF";
            }
        }

        let defaultRole = await Role.findOne({
            name: roleName,
            app: appName
        });

        if (!defaultRole) {
            defaultRole = await Role.create({
                name: roleName,
                app: appName,
                defaultRole: true,
                description: `Default role for ${roleName}`
            });
        } else if (!defaultRole.defaultRole) {
            defaultRole.defaultRole = true;
            await defaultRole.save();
        }

        await UserAppRole.create({
            userId: user._id,
            app: appName,
            role: defaultRole._id,
        });

        res.status(201).json({
            message: "User registered",
            user: {
                _id: user._id,
                name: user.name,
                institutionId: user.institutionId,
                email: user.email,
                phone: user.phone,
                department: user.department,
                designation: user.designation,
                userType: user.userType,
                profileImage: user.profileImage,
                roles: [{
                    role: defaultRole.name,
                    app: appName,
                    permissions: [] // New users with default role typically have no special permissions yet
                }]
            }
        });

    } catch (e) {
        console.error("Register error:", e);
        try {
            fs.writeFileSync(path.join(__dirname, '..', '..', 'error_dump.log'), e.stack || e.message);
        } catch (fsErr) {
            console.error("Failed to write log", fsErr);
        }
        res.status(500).json({ message: e.message });
    }
};
/* ===================================================
   LOGIN (NEW ENTERPRISE FLOW)
===================================================*/
const validateUser = async (req, res) => {

    try {

        const { id, password, app } = req.body;

        if (!id || !password || !app) {
            return res.status(400).json({
                message: "id,password,app required"
            });
        }

        const data =
            await authService.loginUser(
                id, password, app
            );

        generateToken({
            userId: data.user._id,
            app,
            roles: data.roles
        }, res);

        res.json({
            message: "Login success",
            user: {
                _id: data.user._id,
                name: data.user.name,
                institutionId: data.user.institutionId,
                email: data.user.email,
                roles: data.roles,
                profileImage: data.user.profileImage,
                department: data.user.department,
                designation: data.user.designation,
                userType: data.user.userType,
                phone: data.user.phone
            }
        });

    } catch (e) {
        res.status(401).json({
            message: e.message
        });
    }
};


/* ===================================================
   CHANGE PASSWORD
===================================================*/
const changePassword = async (req, res) => {
    try {

        const { oldPassword, newPassword } = req.body;

        const user =
            await UserModel.findById(req.user._id);

        if (!user)
            return res.status(404).json({
                message: "User not found"
            });

        const match =
            await user.comparePassword(oldPassword);

        if (!match)
            return res.status(400).json({
                message: "Old password wrong"
            });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await UserModel.updateOne(
            { _id: user._id },
            { $set: { password: hashedPassword } }
        );

        res.json({
            message: "Password updated"
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};


/* ===================================================
   FORGOT PASSWORD
===================================================*/
const forgotPassword = async (req, res) => {
    try {
        const { institutionId } = req.body;

        if (!institutionId) {
            return res.status(400).json({ message: "Employee ID is required" });
        }

        const user = await UserModel.findOne({ institutionId });

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Verify user has a role in this app
        const appName = process.env.APP_NAME || "UNIFIED_SYSTEM";
        const appMapping = await UserAppRole.findOne({
            userId: user._id,
            app: appName
        });

        if (!appMapping) {
            return res.status(403).json({
                message: "User not authorized for this application"
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

        user.otp = hashedOtp;
        user.otpExpiry = Date.now() + 10 * 60 * 1000;

        await user.save();

        // Send OTP via SMS
        const lastDigits = user.phone ? user.phone.slice(-4) : "****";
        await sendOtpSms(user.phone, user.name, otp);

        res.json({
            message: `OTP sent to your registered mobile number ending in ${lastDigits}`,
            lastDigits: lastDigits
        });

    } catch (e) {
        console.error("Forgot Password Error:", e);
        res.status(500).json({ message: e.message });
    }
};


/* ===================================================
   VERIFY OTP
===================================================*/
const verifyOtp = async (req, res) => {
    try {
        const { institutionId, otp } = req.body;

        if (!institutionId || !otp) {
            return res.status(400).json({ message: "Employee ID and OTP are required" });
        }

        const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

        const user = await UserModel.findOne({
            institutionId,
            otp: hashedOtp,
            otpExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                message: "Invalid or expired OTP"
            });
        }

        res.json({
            message: "OTP verified successfully"
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};


/* ===================================================
   RESET PASSWORD
===================================================*/
const resetPasswordWithOtp = async (req, res) => {
    try {
        const { institutionId, otp, newPassword } = req.body;

        if (!institutionId || !otp || !newPassword) {
            return res.status(400).json({ message: "Employee ID, OTP, and New Password are required" });
        }

        const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

        const user = await UserModel.findOne({
            institutionId,
            otp: hashedOtp,
            otpExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                message: "Invalid or expired OTP"
            });
        }

        user.password = newPassword;
        user.otp = null;
        user.otpExpiry = null;

        await user.save();

        res.json({
            message: "Password reset successfully"
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};


/* ===================================================
   PROFILE
===================================================*/
const getMe = async (req, res) => {
    try {
        const user = await UserModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Lazy Sync: If designation, name, or department is missing, try to fetch from ECAP
        if (!user.designation || !user.name || !user.department) {
            try {
                let identityResponse;
                const userType = user.userType || "Employee";

                if (userType === "Employee") {
                    identityResponse = await axios.get(
                        `https://info.aec.edu.in/adityaAPI/API/staffdata/${user.institutionId}`
                    );
                } else {
                    identityResponse = await axios.get(
                        `https://info.aec.edu.in/adityaapi/api/studentdata/${user.institutionId}`
                    );
                }

                const identityData = identityResponse?.data?.[0];
                if (identityData && !identityData.error) {
                    const ecapName = (userType === "Employee" ? (identityData.employeename || identityData.EmployeeName) : (identityData.studentname || identityData.StudentName));
                    const ecapDesignation = (userType === "Employee" ? (identityData.designation || identityData.Designation || identityData.DesignationName) : "Student");
                    const ecapDepartment = (userType === "Employee" ? identityData.DepartmentName : (identityData.branch || identityData.Branch));

                    if (ecapName) user.name = ecapName;
                    if (ecapDesignation) user.designation = ecapDesignation;
                    if (ecapDepartment) user.department = ecapDepartment;

                    await user.save();
                }
            } catch (syncErr) {
                console.error("Lazy Sync Error:", syncErr.message);
            }
        }

        res.json({
            user: {
                ...user.toObject(),
                roles: req.user.roles
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const logoutUser = (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax"
    });

    res.json({ message: "Logged out" });
};


const updateProfile = async (req, res) => {
    try {
        const allowedFields = ["name", "phone", "department", "institutionId", "designation", "email"];

        //console.log("Update Profile Data:", req.body);

        const updates = {};
        allowedFields.forEach((field) => {
            if (req.body[field]) updates[field] = req.body[field];
        });

        const user = await UserModel.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true }
        );

        res.json({ user });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};



const profileImage = async (req, res) => {
    try {
        const user = await UserModel.findById(req.user._id);

        //  Delete old image if exists
        if (user.profileImage && user.profileImage !== req.file.filename) {
            const oldPath = path.join(
                __dirname,
                "..",
                "..",
                "uploads",
                "profile",
                user.profileImage
            );

            if (fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (unlinkErr) {
                    console.error("Failed to delete old image:", unlinkErr);
                }
            }
        }

        // Save only filename
        await UserModel.updateOne(
            { _id: user._id },
            { $set: { profileImage: req.file.filename } }
        );
        user.profileImage = req.file.filename;

        res.json({
            message: "Image uploaded",
            image: user.profileImage
        });

    } catch (err) {
        console.error("Profile image Error:", err);
        res.status(500).json({ message: "Upload failed: " + err.message, stack: err.stack });
    }
};



const mongoose = require('mongoose');

const searchUser = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ message: "Search query required" });

        const appName = process.env.APP_NAME || 'UNIFIED_SYSTEM';
        const isNumeric = /^[0-9]+$/.test(query);
        let matchStage = {};

        if (isNumeric) {
            matchStage = { institutionId: query };
        } else {
            matchStage = { name: { $regex: query, $options: "i" } };
        }

        const users = await UserModel.aggregate([
            { $match: matchStage },
            { $limit: 20 },
            {
                $lookup: {
                    from: 'userapproles',
                    let: { userId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$userId', '$$userId'] }, { $eq: ['$app', appName] }] } } },
                        {
                            $lookup: {
                                from: 'roles',
                                localField: 'role',
                                foreignField: '_id',
                                as: 'roleData'
                            }
                        },
                        { $unwind: '$roleData' }
                    ],
                    as: 'assignedRoles'
                }
            },
            {
                $project: {
                    name: 1,
                    institutionId: 1,
                    email: 1,
                    userType: 1,
                    roles: {
                        $map: {
                            input: '$assignedRoles',
                            as: 'ar',
                            in: {
                                _id: '$$ar.roleData._id',
                                name: '$$ar.roleData.name',
                                departments: '$$ar.departments'
                            }
                        }
                    }
                }
            }
        ]);

        if (!users.length) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(users);
    } catch (error) {
        console.error("Search Error:", error);
        res.status(500).json({ message: error.message });
    }
};




const getecapdata = async (req, res) => {
    try {
        const { institutionId, role } = req.body;

        let response;

        if (role === "Employee") {
            response = await axios.get(
                `https://info.aec.edu.in/adityaAPI/API/staffdata/${institutionId}`

            );
        } else if (role === "Student") {
            response = await axios.get(
                `https://info.aec.edu.in/adityaapi/api/studentdata/${institutionId}`

            );
        }

        const data = response.data?.[0]; // API returns array

        res.json(data);
    } catch (error) {
        console.error("API ERROR:", error.response?.data || error.message);

        res.status(500).json({
            message: "Failed to fetch data",
        });
    }
};




const getActiveUsersCount = async (req, res) => {
    try {
        const { appName, roleName } = req.query;

        if (!appName) {
            return res.status(400).json({ message: "App name is required" });
        }

        let query = { app: appName };

        // If roleName is provided, find the role ID first
        if (roleName) {
            const role = await Role.findOne({ name: roleName.toUpperCase(), app: appName });
            if (role) {
                query.role = role._id;
            } else {
                // If role doesn't exist for this app, count is 0
                return res.json({ activeUsers: 0 });
            }
        }

        const uniqueUsers = await UserAppRole.distinct("userId", query);

        res.json({
            activeUsers: uniqueUsers.length
        });
    } catch (error) {
        console.error("Active Users Count Error:", error);
        res.status(500).json({ message: error.message });
    }
};


const bulkRegisterUser = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const results = [];
        const errors = [];
        const appName = process.env.APP_NAME || "UNIFIED_SYSTEM";

        // Read file and parse CSV
        const stream = fs.createReadStream(req.file.path).pipe(csv());

        for await (const row of stream) {
            try {
                const {
                    name, institutionId, department, designation,
                    email, phone, password, userType
                } = row;

                // Basic validation
                if (!name || !institutionId || !department || !email || !phone || !password || !userType) {
                    errors.push({ id: institutionId || "Unknown", error: "Missing required fields" });
                    continue;
                }

                // Check duplicates
                const existing = await UserModel.findOne({
                    $or: [{ institutionId }, { email: email.toLowerCase() }]
                });

                if (existing) {
                    errors.push({ id: institutionId, error: "User ID or Email already exists" });
                    continue;
                }

                // Create User
                const user = await UserModel.create({
                    name, institutionId, department, designation,
                    email, phone, password, userType
                });

                // Assign Identity Role
                let roleName = "STUDENT";
                if (userType === "Employee") {
                    const checkDesig = (designation || "").toLowerCase();
                    if (/prof|professor|ass|teaching|ph\.?d\.?\s*full[- ]?time\s*scholar/i.test(checkDesig)) {
                        roleName = "FACULTY";
                    } else if (/technician|programmer/i.test(checkDesig)) {
                        roleName = "TECHNICIAN";
                    } else {
                        roleName = "STAFF";
                    }
                }

                let defaultRole = await Role.findOne({ name: roleName, app: appName });
                if (!defaultRole) {
                    defaultRole = await Role.create({
                        name: roleName, app: appName, defaultRole: true,
                        description: `Default role for ${roleName}`
                    });
                }

                await UserAppRole.create({
                    userId: user._id,
                    app: appName,
                    role: defaultRole._id,
                });

                results.push({ id: institutionId, status: "Success" });
            } catch (rowErr) {
                errors.push({ id: row.institutionId || "Unknown", error: rowErr.message });
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            total: results.length + errors.length,
            successCount: results.length,
            failureCount: errors.length,
            errors
        });

    } catch (e) {
        console.error("Bulk upload error:", e);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = {
    registerUser,
    validateUser,
    changePassword,
    forgotPassword,
    verifyOtp,
    resetPasswordWithOtp,
    logoutUser,
    getMe,
    updateProfile,
    profileImage,
    searchUser,
    getecapdata,
    getActiveUsersCount,
    bulkRegisterUser
};
