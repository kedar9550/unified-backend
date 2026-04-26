const Employee = require('./employee.model');
const Role = require('../role/role.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Department = require('../academics/department.model');
const authService = require('../../utils/authService');
const generateToken = require('../../utils/generateToken');
const sendOtpSms = require('../../utils/smsService');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

const isProd = process.env.NODE_ENV === 'production';

/**
 * Register Employee
 */
const registerUser = async (req, res) => {
    try {
        const { fullname, id, department, designation, email, phone, password } = req.body;

        if (!fullname || !id || !department || !designation || !email || !phone || !password) {
            return res.status(400).json({ message: "All fields required" });
        }

        const existingInstitution = await Employee.findOne({ institutionId: id });
        if (existingInstitution) return res.status(409).json({ message: "Employee with this ID already exists" });

        const existingEmail = await Employee.findOne({ email: email.toLowerCase() });
        if (existingEmail) return res.status(409).json({ message: "Email is already registered" });

        // Verify Identity with Institute API (Persona Check)
        try {
            const identityResponse = await axios.get(`https://info.aec.edu.in/adityaAPI/API/staffdata/${id}`);
            const identityData = identityResponse?.data?.[0];

            if (!identityData || identityData.error) {
                return res.status(404).json({ message: `Invalid Employee ID. Not found in ECAP` });
            }

            const ecapName = (identityData.employeename || identityData.EmployeeName)?.trim().toLowerCase();
            if (ecapName && ecapName !== fullname.trim().toLowerCase()) {
                return res.status(400).json({ message: "Name does not match Institute records" });
            }
        } catch (apiErr) {
            console.error("ECAP ERROR:", apiErr.message);
        }

        const deptRecord = await Department.findOne({
            $or: [
                { name: new RegExp(`^${department}$`, 'i') },
                { code: new RegExp(`^${department}$`, 'i') }
            ]
        });

        if (!deptRecord) {
            return res.status(404).json({ message: `Department '${department}' not found in our system. Please add it first.` });
        }

        const employee = await Employee.create({
            name: fullname,
            institutionId: id,
            department: deptRecord._id,
            designation,
            email,
            phone,
            password
        });

        const appName = process.env.APP_NAME || "UNIFIED_SYSTEM";
        let roleName = "STAFF";
        const checkDesig = (designation || "").toLowerCase();
        if (/prof|professor|ass|teaching|ph\.?d\.?\s*full[- ]?time\s*scholar/i.test(checkDesig)) {
            roleName = "FACULTY";
        } else if (/technician|programmer/i.test(checkDesig)) {
            roleName = "TECHNICIAN";
        }

        let defaultRole = await Role.findOne({ name: roleName, app: appName });
        if (!defaultRole) {
            defaultRole = await Role.create({
                name: roleName,
                app: appName,
                defaultRole: true,
                description: `Default role for ${roleName}`
            });
        }

        await UserAppRole.create({
            userId: employee._id,
            userModel: 'Employee',
            app: appName,
            role: defaultRole._id,
        });

        res.status(201).json({
            message: "Employee registered",
            user: {
                _id: employee._id,
                name: employee.name,
                institutionId: employee.institutionId,
                email: employee.email,
                phone: employee.phone,
                department: employee.department,
                designation: employee.designation,
                userType: 'Employee'
            }
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

/**
 * Unified Login
 */
const validateUser = async (req, res) => {
    try {
        const { id, password, app } = req.body;
        if (!id || !password || !app) {
            return res.status(400).json({ message: "id, password, and app are required" });
        }

        const data = await authService.loginUser(id, password, app);

        generateToken({ 
            userId: data.user._id, 
            institutionId: data.user.institutionId,
            userType: data.user.userType,
            app, 
            roles: data.roles 
        }, res);

        res.json({ message: "Login success", user: { ...data.user, roles: data.roles } });
    } catch (e) {
        res.status(401).json({ message: e.message });
    }
};

/**
 * Get Current User (Me)
 */
const getMe = async (req, res) => {
    try {
        let user;
        const isNumeric = /^\d+$/.test(req.user.institutionId);

        if (isNumeric) {
            user = await Employee.findById(req.user._id);
        } else {
            const Student = require('../StudentData/Studentdata.model');
            user = await Student.findById(req.user._id);
        }

        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({
            user: {
                ...req.user,
                roles: req.user.roles
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Logout
 */
const logoutUser = (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax"
    });
    res.json({ message: "Logged out" });
};

/**
 * Update Profile
 */
const updateProfile = async (req, res) => {
    try {
        const allowedFields = ["name", "phone", "department", "institutionId", "designation", "email"];
        const updates = {};
        allowedFields.forEach((field) => {
            if (req.body[field]) updates[field] = req.body[field];
        });

        const user = await Employee.findByIdAndUpdate(req.user._id, updates, { new: true });
        res.json({ user });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Profile Image Upload
 */
const profileImage = async (req, res) => {
    try {
        const user = await Employee.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "Employee only feature" });

        if (user.profileImage && user.profileImage !== req.file.filename) {
            const oldPath = path.join(__dirname, "..", "..", "uploads", "profile", user.profileImage);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        await Employee.updateOne({ _id: user._id }, { $set: { profileImage: req.file.filename } });
        res.json({ message: "Image uploaded", image: req.file.filename });
    } catch (err) {
        res.status(500).json({ message: "Upload failed" });
    }
};

/**
 * Search Employees
 */
const searchUser = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ message: "Search query required" });

        const isNumeric = /^[0-9]+$/.test(query);
        const matchStage = isNumeric ? { institutionId: query } : { name: { $regex: query, $options: "i" } };

        const users = await Employee.aggregate([
            { $match: matchStage },
            { $limit: 20 },
            {
                $lookup: {
                    from: 'userapproles',
                    localField: '_id',
                    foreignField: 'userId',
                    as: 'userAppRoles'
                }
            },
            {
                $lookup: {
                    from: 'roles',
                    localField: 'userAppRoles.role',
                    foreignField: '_id',
                    as: 'roles'
                }
            },
            {
                $project: {
                    name: 1,
                    institutionId: 1,
                    email: 1,
                    department: 1,
                    designation: 1,
                    userType: { $literal: 'Employee' },
                    roles: 1
                }
            }
        ]);
        
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Fetch ECAP Data
 */
const getecapdata = async (req, res) => {
    try {
        const { institutionId, role } = req.body;
        let response;
        if (role === "Employee") {
            response = await axios.get(`https://info.aec.edu.in/adityaAPI/API/staffdata/${institutionId}`);
        } else if (role === "Student") {
            response = await axios.get(`https://info.aec.edu.in/adityaapi/api/studentdata/${institutionId}`);
        }
        const data = response.data?.[0];
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch data" });
    }
};

/**
 * Bulk Register Employees
 */
const bulkRegisterUser = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const results = [];
        const errors = [];
        const appName = process.env.APP_NAME || "UNIFIED_SYSTEM";

        const stream = fs.createReadStream(req.file.path).pipe(csv());

        for await (const row of stream) {
            try {
                const institutionId = row.institutionId?.trim();
                const email = row.email?.trim();

                if (!institutionId) {
                    errors.push({ id: "Unknown", error: "Missing institutionId in CSV" });
                    continue;
                }

                if (!email) {
                    errors.push({ id: institutionId, error: "Missing email in CSV" });
                    continue;
                }

                // Validate email format
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    errors.push({ id: institutionId, error: "Invalid email format" });
                    continue;
                }

                const existing = await Employee.findOne({ $or: [{ institutionId }, { email: email.toLowerCase() }] });
                if (existing) {
                    errors.push({ id: institutionId, error: "Employee with this ID or Email already exists" });
                    continue;
                }

                // Fetch ECAP Data
                let identityData = null;
                try {
                    const identityResponse = await axios.get(`https://info.aec.edu.in/adityaAPI/API/staffdata/${institutionId}`);
                    identityData = identityResponse?.data?.[0];
                } catch (apiErr) {
                    errors.push({ id: institutionId, error: "Failed to connect to ECAP API" });
                    continue;
                }

                if (!identityData || identityData.error) {
                    errors.push({ id: institutionId, error: "Invalid Employee ID. Not found in ECAP" });
                    continue;
                }

                const ecapName = (identityData.employeename || identityData.EmployeeName)?.trim();
                const ecapDept = (identityData.departmentname || identityData.DepartmentName)?.trim();
                const ecapDesig = (identityData.designation || identityData.Designation)?.trim() || "Employee";
                const ecapPhone = (identityData.mobileno || identityData.MobileNo)?.trim() || "0000000000";

                if (!ecapName || !ecapDept) {
                    errors.push({ id: institutionId, error: "Missing Name or Department in ECAP Data" });
                    continue;
                }

                // Match Department
                const deptRecord = await Department.findOne({
                    $or: [
                        { name: new RegExp(`^${ecapDept}$`, 'i') },
                        { code: new RegExp(`^${ecapDept}$`, 'i') }
                    ]
                });

                if (!deptRecord) {
                    errors.push({ id: institutionId, error: `Department '${ecapDept}' from ECAP not found in our system.` });
                    continue;
                }

                const password = "Aditya@123"; // Default password

                const user = await Employee.create({ 
                    name: ecapName, 
                    institutionId, 
                    department: deptRecord._id, 
                    designation: ecapDesig, 
                    email, 
                    phone: ecapPhone, 
                    password 
                });
                
                let roleName = "STAFF";
                const checkDesig = (ecapDesig || "").toLowerCase();
                if (/prof|professor|ass|teaching|ph\.?d\.?\s*full[- ]?time\s*scholar/i.test(checkDesig)) roleName = "FACULTY";
                else if (/technician|programmer/i.test(checkDesig)) roleName = "TECHNICIAN";

                let defaultRole = await Role.findOne({ name: roleName, app: appName });
                if (!defaultRole) defaultRole = await Role.create({ name: roleName, app: appName, defaultRole: true, description: `Default role for ${roleName}` });

                await UserAppRole.create({ userId: user._id, userModel: 'Employee', app: appName, role: defaultRole._id });
                results.push({ id: institutionId, status: "Success" });
            } catch (rowErr) {
                errors.push({ id: row.institutionId || "Unknown", error: rowErr.message });
            }
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            total: results.length + errors.length,
            successCount: results.length,
            failureCount: errors.length,
            errors
        });
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = {
    registerUser,
    validateUser,
    logoutUser,
    getMe,
    updateProfile,
    profileImage,
    searchUser,
    getecapdata,
    bulkRegisterUser
};
