const PhdApplication = require('./PhdApplication.model');
const PhdScholar = require('./PhdScholar.model');
const Employee = require('../employee/employee.model');
const studentService = require('../StudentData/student.service');
const Program = require('../academics/program.model');
const escapeRegex = require('../../utils/escapeRegex');
const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Validate student by Roll Number and verify if Ph.D. Scholar
// @route   GET /api/research/phd-scholar/validate/:rollNo
// @access  Private (Faculty)
exports.validateScholar = async (req, res) => {
    try {
        const rollNo = req.params.rollNo.trim().toUpperCase();

        // 1. Check if scholar already completed/Awarded in Master
        const masterScholar = await PhdScholar.findOne({ rollNumber: rollNo });
        if (masterScholar && masterScholar.currentStatus === 'Awarded') {
            return res.status(400).json({ 
                success: false, 
                message: `Scholar ${rollNo} has already been awarded their Ph.D. degree.` 
            });
        }

        // 2. Fetch student details from ECAP API
        const externalData = await studentService.fetchStudentDataFromAPI(rollNo);
        if (!externalData) {
            return res.status(404).json({ 
                success: false, 
                message: `Student details not found in ECAP for Roll Number ${rollNo}` 
            });
        }

        const studentName = externalData.studentname ? externalData.studentname.trim() : "";
        const programName = externalData.coursename ? externalData.coursename.trim() : "";
        const branchName = externalData.branch ? externalData.branch.trim() : "";

        // 3. Validate whether the student is a Ph.D. Scholar
        // Checks if coursename contains "ph.d" or "phd" case-insensitively or is type 'PHD' in DB
        const programExists = await Program.findOne({ name: new RegExp(`^${escapeRegex(programName)}$`, "i") });
        const isPhd = /ph\.?d/i.test(programName) || (programExists && programExists.type === 'PHD');

        if (!isPhd) {
            return res.status(400).json({
                success: false,
                message: `Validation failed: Roll Number ${rollNo} belongs to course "${programName}", which is not a Ph.D. program.`,
                data: { studentName, course: programName, branch: branchName, isPhd: false }
            });
        }

        res.json({
            success: true,
            data: {
                studentName,
                course: programName,
                branch: branchName,
                isPhd: true,
                existingGuide: masterScholar ? masterScholar.guideId : null,
                currentStatus: masterScholar ? masterScholar.currentStatus : 'New Scholar'
            }
        });
    } catch (err) {
        console.error("Scholar Validation Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Submit yearly Ph.D. Scholar appraisal application
// @route   POST /api/research/phd-scholar
// @access  Private (Faculty)
exports.createPhdApplication = async (req, res) => {
    try {
        const data = req.body;
        const rollNo = data.rollNumber ? data.rollNumber.trim().toUpperCase() : "";

        // 1. Mandatory Fields check
        if (!rollNo || !data.studentName || !data.course || !data.scholarStatus || !data.admissionOrAwardDate || !data.academicYear || !data.scholarType || !data.university) {
            return res.status(400).json({ success: false, message: "Please fill all mandatory fields." });
        }

        // Validate date (not in future)
        if (new Date(data.admissionOrAwardDate) > new Date()) {
            return res.status(400).json({ success: false, message: "Admission or Award Date cannot be in the future." });
        }

        // 2. Validate supporting document file uploaded
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Supporting proof document is mandatory." });
        }

        // 3. Master Awarded check
        const masterScholar = await PhdScholar.findOne({ rollNumber: rollNo });
        if (masterScholar && masterScholar.currentStatus === 'Awarded') {
            return res.status(400).json({ 
                success: false, 
                message: "This scholar has already been awarded their Ph.D. degree." 
            });
        }

        // 4. Duplicate checks: two different Faculty IDs cannot have same scholar with same status
        const existingActive = await PhdApplication.findOne({
            rollNumber: rollNo,
            scholarStatus: data.scholarStatus,
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingActive) {
            if (existingActive.facultyId.toString() !== req.user.userId.toString()) {
                const guide = await Employee.findById(existingActive.facultyId).select('name');
                return res.status(400).json({
                    success: false,
                    message: `This scholar roll number is already registered under guide ${guide ? guide.name : "another faculty"} with status "${data.scholarStatus}".`
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: `You have already submitted a pending or approved application for this scholar with status "${data.scholarStatus}".`
                });
            }
        }

        const application = new PhdApplication({
            facultyId: req.user.userId,
            academicYear: data.academicYear,
            rollNumber: rollNo,
            studentName: data.studentName,
            course: data.course,
            branch: data.branch,
            scholarStatus: data.scholarStatus,
            scholarType: data.scholarType,
            university: data.university,
            admissionOrAwardDate: data.admissionOrAwardDate,
            document: `/uploads/phdScholars/${req.file.filename}`,
            status: 'Pending at HOD'
        });

        await application.save();
        res.status(201).json({ success: true, data: application });
    } catch (err) {
        console.error("Create PhdApplication Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own Ph.D. Scholar applications
// @route   GET /api/research/phd-scholar
// @access  Private (Faculty)
exports.getMyApplications = async (req, res) => {
    try {
        const applications = await PhdApplication.find({ facultyId: req.user.userId })
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });
        
        // Add applicant visibility metadata
        const list = applications.map(app => {
            const obj = app.toObject();
            obj.visibilityRole = "Applicant";
            return obj;
        });

        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get Ph.D. application by ID
// @route   GET /api/research/phd-scholar/:id
// @access  Private
exports.getApplicationById = async (req, res) => {
    try {
        const application = await PhdApplication.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year');
            
        if (!application) {
            return res.status(404).json({ success: false, message: 'Ph.D. Scholar application not found' });
        }
        res.json({ success: true, data: application });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get all Ph.D. applications for a specific faculty
// @route   GET /api/research/phd-scholar/by-faculty/:facultyId
// @access  Private (HOD, R&D)
exports.getApplicationsByFaculty = async (req, res) => {
    try {
        const { facultyId } = req.params;
        const applications = await PhdApplication.find({ facultyId })
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 });
            
        res.json({ success: true, data: applications });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get pending Ph.D. applications at HOD
// @route   GET /api/research/phd-scholar/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        const deptIds = await getHODDepartments(req.user);
        
        const facultyIds = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ]
        }).distinct('_id');
        
        const applications = await PhdApplication.find({ 
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');
        
        res.json({ success: true, data: applications });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/phd-scholar/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const application = await PhdApplication.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: application });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get pending Ph.D. applications at R&D
// @route   GET /api/research/phd-scholar/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const applications = await PhdApplication.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: applications });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject) - Upserts Scholar Master Collection on approval
// @route   PUT /api/research/phd-scholar/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        
        // Find and update application
        const application = await PhdApplication.findByIdAndUpdate(id, { 
            status, 
            rndComment: comment 
        }, { new: true });

        if (!application) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        // Create or update Master Tracking record only when approved
        if (action === 'Approve') {
            await PhdScholar.findOneAndUpdate(
                { rollNumber: application.rollNumber },
                {
                    rollNumber: application.rollNumber,
                    studentName: application.studentName,
                    course: application.course,
                    branch: application.branch,
                    currentStatus: application.scholarStatus,
                    scholarType: application.scholarType || "Full-Time",
                    university: application.university || "Aditya University",
                    guideId: application.facultyId
                },
                { upsert: true, new: true }
            );
        }

        res.json({ success: true, data: application });
    } catch (err) {
        console.error("rndAction Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
