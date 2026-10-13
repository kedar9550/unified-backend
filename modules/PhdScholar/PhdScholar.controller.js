const fs = require('fs');
const path = require('path');
const PhdApplication = require('./PhdApplication.model');
const Employee = require('../employee/employee.model');
const studentService = require('../StudentData/student.service');
const Program = require('../academics/program.model');
const escapeRegex = require('../../utils/escapeRegex');
const { getHODDepartments } = require('../../utils/hodHelper');

const deleteOldFile = (oldPath) => {
    if (oldPath) {
        try {
            const cleanPath = oldPath.replace(/^\//, ''); // Remove leading slash
            const fullPath = path.join(__dirname, '../..', cleanPath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        } catch (e) {
            console.error("Failed to delete old file:", oldPath, e);
        }
    }
};

// @desc    Validate student by Roll Number and verify if Ph.D. Scholar
// @route   GET /api/research/phd-scholar/validate/:rollNo
// @access  Private (Faculty)
exports.validateScholar = async (req, res) => {
    try {
        const rollNo = req.params.rollNo.trim().toUpperCase();

        // 1. Check if scholar already completed/Awarded in PhdApplication
        const awardedApp = await PhdApplication.findOne({ 
            rollNumber: rollNo, 
            scholarStatus: 'Awarded', 
            status: 'Approved' 
        });
        if (awardedApp) {
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

        const existingGuide = await PhdApplication.findOne({
            rollNumber: rollNo,
            type: { $ne: 'co-guide' },
            status: { $not: /rejected/i }
        }).populate('facultyId', 'name institutionId');

        const existingCoGuide = await PhdApplication.findOne({
            rollNumber: rollNo,
            type: 'co-guide',
            status: { $not: /rejected/i }
        }).populate('facultyId', 'name institutionId');

        const myExistingApp = await PhdApplication.findOne({ rollNumber: rollNo, facultyId: req.user.userId });

        res.json({
            success: true,
            data: {
                studentName,
                course: programName,
                branch: branchName,
                isPhd: true,
                existingGuide: existingGuide ? {
                    name: existingGuide.facultyId?.name,
                    empId: existingGuide.facultyId?.institutionId
                } : null,
                existingCoGuide: existingCoGuide ? {
                    name: existingCoGuide.facultyId?.name,
                    empId: existingCoGuide.facultyId?.institutionId
                } : null,
                currentStatus: (myExistingApp || existingGuide || existingCoGuide)?.scholarStatus || 'New Scholar',
                existingApplication: myExistingApp ? {
                    _id: myExistingApp._id,
                    scholarStatus: myExistingApp.scholarStatus,
                    status: myExistingApp.status,
                    type: myExistingApp.type || 'guide',
                    isRejected: Boolean(myExistingApp.status && myExistingApp.status.toLowerCase().includes('rejected'))
                } : null
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
        const titleOfPhdWork = data.titleOfPhdWork ? data.titleOfPhdWork.trim() : "";

        const dateVal = data.admissionDate || data.awardDate || data.admissionOrAwardDate;

        // 1. Mandatory Fields check (titleOfPhdWork is optional, but unique if provided)
        if (!rollNo || !data.studentName || !data.course || !data.scholarStatus || !dateVal || !data.academicYear || !data.scholarType || !data.university) {
            return res.status(400).json({ success: false, message: "Please fill all mandatory fields." });
        }

        // Validate date (not in future)
        if (new Date(dateVal) > new Date()) {
            return res.status(400).json({ success: false, message: "Admission or Award Date cannot be in the future." });
        }

        // 2. Validate supporting document file uploaded
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Supporting proof document is mandatory." });
        }

        // 3. Awarded check in PhdApplication
        const existingAwarded = await PhdApplication.findOne({ 
            rollNumber: rollNo, 
            scholarStatus: 'Awarded', 
            status: 'Approved' 
        });
        if (existingAwarded) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(400).json({ 
                success: false, 
                message: "This scholar has already been awarded their Ph.D. degree." 
            });
        }

        // 4. Duplicate check on Title of the Ph.D Work (Must be unique across all Ph.D. entries if provided)
        if (titleOfPhdWork) {
            const existingWithTitle = await PhdApplication.findOne({
                titleOfPhdWork: new RegExp(`^${escapeRegex(titleOfPhdWork)}$`, 'i')
            }).populate('facultyId', 'name institutionId');

            if (existingWithTitle) {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                const facultyName = existingWithTitle.facultyId ? existingWithTitle.facultyId.name : "another faculty member";
                const isSameUser = existingWithTitle.facultyId && existingWithTitle.facultyId._id.toString() === req.user.userId;
                return res.status(400).json({
                    success: false,
                    message: isSameUser
                        ? `You have already registered a Ph.D. Scholar with the title "${titleOfPhdWork}". Title of the Ph.D Work must be unique.`
                        : `A Ph.D. Scholar entry with the title "${titleOfPhdWork}" already exists under ${facultyName}. Title of the Ph.D Work must be unique.`
                });
            }
        }

        // Determine target faculty ID and status (supports direct entry by R&D admin)
        let finalFacultyId = req.user.userId;
        let finalStatus = 'Pending';
        let finalEntryType = 'Self';

        if (data.isDirectEntry === 'true') {
            const activeRole = (req.headers['active-role'] || req.user?.role || '').toUpperCase().trim();
            const userRoles = (req.user?.roles || []).flatMap(r => {
                const roleName = (r.role?.name || '').toUpperCase().trim();
                const roleKey = (r.role?.key || '').toUpperCase().trim();
                const roleDirect = (typeof r === 'string' ? r : (typeof r.role === 'string' ? r.role : '')).toUpperCase().trim();
                return [roleName, roleKey, roleDirect].filter(Boolean);
            });
            const isRndAdmin = activeRole === 'RESEARCH_DEAN' || activeRole === 'RESEARCH_COORDINATOR' ||
                               userRoles.includes('RESEARCH_DEAN') || userRoles.includes('RESEARCH_COORDINATOR') ||
                               userRoles.includes('RESEARCH DEAN') || userRoles.includes('ADMIN');

            if (!isRndAdmin) {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                return res.status(403).json({ success: false, message: "Only R&D Admin or Dean can use direct entry." });
            }

            const targetEmpId = data.targetFacultyEmpId;
            if (!targetEmpId) {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                return res.status(400).json({ success: false, message: "Target Faculty Employee ID is required for direct entry." });
            }

            const targetFaculty = await Employee.findOne({ 
                institutionId: new RegExp(`^${escapeRegex(targetEmpId.trim())}$`, 'i') 
            });

            if (!targetFaculty) {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                return res.status(400).json({ success: false, message: `Target Faculty with ID ${targetEmpId} not found.` });
            }

            if (!targetFaculty.isActive) {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                return res.status(400).json({ success: false, message: `Faculty ${targetFaculty.name} (${targetFaculty.institutionId}) is inactive and cannot be selected.` });
            }

            finalFacultyId = targetFaculty._id;
            finalStatus = 'Approved';
            finalEntryType = 'Admin';
        }

        const supervisionType = (data.type || '').toLowerCase() === 'co-guide' ? 'co-guide' : 'guide';
        const roleLabel = supervisionType === 'co-guide' ? 'Co-Guide' : 'Guide';

        // 5. Duplicate Check: Same Faculty cannot submit duplicate entries for the same scholar
        // Whether they previously applied as Guide or Co-Guide, or are now changing roles
        const myExistingApp = await PhdApplication.findOne({
            rollNumber: rollNo,
            facultyId: finalFacultyId
        });

        if (myExistingApp) {
            // Case 5a: If scholar is currently 'Pursuing' and user is submitting 'Awarded' -> prompt milestone update modal
            if (myExistingApp.scholarStatus === 'Pursuing' && data.scholarStatus === 'Awarded') {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                return res.status(400).json({
                    success: false,
                    code: 'PURSUING_SCHOLAR_EXISTS',
                    existingScholar: {
                        _id: myExistingApp._id,
                        rollNumber: myExistingApp.rollNumber,
                        studentName: myExistingApp.studentName,
                        status: myExistingApp.status
                    },
                    message: `Scholar (${rollNo}) is already registered as 'Pursuing' under your submissions. You cannot create a separate new entry for 'Awarded'. Please locate the scholar in your list and click 'Mark as Awarded' to update their milestone.`
                });
            }

            // Case 5b: If existing application was rejected, instruct faculty to edit and resubmit
            const existingRole = (myExistingApp.type || 'guide').toLowerCase() === 'co-guide' ? 'Co-Guide' : 'Guide';
            if (myExistingApp.status && myExistingApp.status.toLowerCase().includes('rejected')) {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                return res.status(400).json({
                    success: false,
                    message: `You already have a rejected application for this scholar (${rollNo}) as ${existingRole}. Please edit and resubmit your existing application instead of creating a new duplicate entry.`
                });
            }

            // Case 5c: Already registered (under Guide or Co-Guide)
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(400).json({
                success: false,
                message: `You have already registered scholar (${rollNo}) as ${existingRole} (Status: ${myExistingApp.status || 'Pending'}). A faculty member cannot submit the same scholar multiple times.`
            });
        }

        // 6. University-wide Duplicate Check: Role Uniqueness across different faculty members
        // A Ph.D. scholar can have at most one primary Guide and at most one Co-Guide
        if (supervisionType === 'guide') {
            const existingGuide = await PhdApplication.findOne({
                rollNumber: rollNo,
                type: { $ne: 'co-guide' },
                status: { $not: /rejected/i }
            }).populate('facultyId', 'name institutionId');

            if (existingGuide) {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                const guideName = existingGuide.facultyId ? existingGuide.facultyId.name : "another faculty member";
                return res.status(400).json({
                    success: false,
                    message: `Scholar (${rollNo}) already has a registered Guide (${guideName}). A Ph.D. scholar can only have one primary Guide.`
                });
            }
        } else if (supervisionType === 'co-guide') {
            const existingCoGuide = await PhdApplication.findOne({
                rollNumber: rollNo,
                type: 'co-guide',
                status: { $not: /rejected/i }
            }).populate('facultyId', 'name institutionId');

            if (existingCoGuide) {
                if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                const coGuideName = existingCoGuide.facultyId ? existingCoGuide.facultyId.name : "another faculty member";
                return res.status(400).json({
                    success: false,
                    message: `Scholar (${rollNo}) already has a registered Co-Guide (${coGuideName}). A Ph.D. scholar can only have one Co-Guide.`
                });
            }
        }

        const pursuingDetails = data.scholarStatus === 'Pursuing' ? {
            academicYear: data.academicYear,
            admissionDate: dateVal,
            document: `/uploads/phdScholars/${req.file.filename}`,
            status: finalStatus,
            submittedAt: new Date()
        } : undefined;

        const awardedDetails = data.scholarStatus === 'Awarded' ? {
            academicYear: data.academicYear,
            awardDate: dateVal,
            document: `/uploads/phdScholars/${req.file.filename}`,
            status: finalStatus,
            submittedAt: new Date()
        } : undefined;

        const application = new PhdApplication({
            facultyId: finalFacultyId,
            academicYear: data.academicYear,
            rollNumber: rollNo,
            studentName: data.studentName,
            ...(titleOfPhdWork ? { titleOfPhdWork } : {}),
            course: data.course,
            branch: data.branch,
            scholarStatus: data.scholarStatus,
            scholarType: data.scholarType,
            university: data.university,
            document: `/uploads/phdScholars/${req.file.filename}`,
            status: finalStatus,
            entryType: finalEntryType,
            type: supervisionType,
            ...(pursuingDetails ? { pursuingDetails } : {}),
            ...(awardedDetails ? { awardedDetails } : {})
        });

        await application.save();

        // Target: Send notification to the applicant's reporting boss
        try {
            const { getReportingBossId } = require('../hierarchy/reportingBoss.helper');
            const NotificationService = require('../notification/notification.service');
            const EmployeeModel = require('../employee/employee.model');

            const emp = await EmployeeModel.findById(req.user.userId);
            if (emp) {
                const bossUserId = await getReportingBossId(req.user.userId);
                if (bossUserId) {
                    await NotificationService.sendNotification({
                        recipientId: bossUserId,
                        senderId: req.user.userId,
                        module: 'Research',
                        type: 'INFO',
                        title: 'New Research Submission',
                        message: `${emp.name || 'A faculty member'} has submitted a new Ph.D. Scholar application: ${application.studentName}`,
                        link: `/hod/research-approvals`, 

                    });
                }
            }

            if (data.isDirectEntry === 'true' && finalFacultyId.toString() !== req.user.userId) {
                 await NotificationService.sendNotification({
                    recipientId: finalFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: 'SUCCESS',
                    title: 'Ph.D. Scholar Application Added',
                    message: `R&D has directly added an approved Ph.D. Scholar application for you: ${application.studentName}`,
                    link: `/research/phd-scholars`
                 });
            }
        } catch (notifErr) {
            console.error("Failed to send phd scholar notification:", notifErr);
        }
        res.status(201).json({ success: true, data: application });
    } catch (err) {
        if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
        console.error("Create PhdApplication Error:", err);
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Duplicate entry: A Ph.D. Scholar with this Title of Ph.D Work already exists."
            });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update and resubmit an existing rejected Ph.D. Scholar application
// @route   PUT /api/research/phd-scholar/:id
// @access  Private (Faculty)
exports.updatePhdApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const application = await PhdApplication.findById(id);
        if (!application) {
            return res.status(404).json({ success: false, message: "Ph.D. Scholar application not found." });
        }

        // Verify ownership
        if (application.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Not authorized to edit this application." });
        }

        if (!application.status.includes('Rejected')) {
            return res.status(400).json({ success: false, message: "Only rejected applications can be edited and resubmitted." });
        }

        const rollNo = data.rollNumber ? data.rollNumber.trim().toUpperCase() : application.rollNumber;

        // Date Validation
        if (data.admissionOrAwardDate && new Date(data.admissionOrAwardDate) > new Date()) {
            return res.status(400).json({ success: false, message: "Admission or Award Date cannot be in the future." });
        }

        // Validate file size (200KB limit as per guidelines)
        if (req.file) {
            if (req.file.size > 200 * 1024) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Supporting document is too large. Maximum allowed size is 200KB.` 
                });
            }
        }

        // Title of the Ph.D Work uniqueness check if updating (optional, unique if provided)
        if (data.titleOfPhdWork !== undefined) {
            const checkTitle = data.titleOfPhdWork.trim();
            if (checkTitle) {
                const existingWithTitle = await PhdApplication.findOne({
                    _id: { $ne: id },
                    titleOfPhdWork: new RegExp(`^${escapeRegex(checkTitle)}$`, 'i')
                }).populate('facultyId', 'name institutionId');

                if (existingWithTitle) {
                    const facultyName = existingWithTitle.facultyId ? existingWithTitle.facultyId.name : "another faculty member";
                    return res.status(400).json({
                        success: false,
                        message: `A Ph.D. Scholar entry with the title "${checkTitle}" already exists under ${facultyName}. Title of the Ph.D Work must be unique.`
                    });
                }
            }
        }

        // Duplicate checks based on student + type + scholarStatus
        const checkScholarStatus = data.scholarStatus || application.scholarStatus;
        const checkType = (data.type || application.type || 'guide').toLowerCase() === 'co-guide' ? 'co-guide' : 'guide';
        const roleLabel = checkType === 'co-guide' ? 'Co-Guide' : 'Guide';

        // 1. Same faculty check: Cannot duplicate another application under this faculty for the same scholar
        const duplicateForFaculty = await PhdApplication.findOne({
            _id: { $ne: id },
            rollNumber: rollNo,
            facultyId: application.facultyId
        });
        if (duplicateForFaculty) {
            const dupRole = (duplicateForFaculty.type || 'guide').toLowerCase() === 'co-guide' ? 'Co-Guide' : 'Guide';
            return res.status(400).json({
                success: false,
                message: `You already have another application for this scholar (${rollNo}) as ${dupRole}. Duplicate entries are not permitted.`
            });
        }

        // 2. Guide uniqueness across university
        if (checkType === 'guide') {
            const existingGuide = await PhdApplication.findOne({
                _id: { $ne: id },
                rollNumber: rollNo,
                type: { $ne: 'co-guide' },
                status: { $not: /rejected/i }
            }).populate('facultyId', 'name institutionId');

            if (existingGuide) {
                const guideName = existingGuide.facultyId ? existingGuide.facultyId.name : "another faculty member";
                return res.status(400).json({
                    success: false,
                    message: `Scholar (${rollNo}) already has a registered Guide (${guideName}). A Ph.D. scholar can only have one primary Guide.`
                });
            }
        }

        // 3. Co-Guide uniqueness across university
        if (checkType === 'co-guide') {
            const existingCoGuide = await PhdApplication.findOne({
                _id: { $ne: id },
                rollNumber: rollNo,
                type: 'co-guide',
                status: { $not: /rejected/i }
            }).populate('facultyId', 'name institutionId');

            if (existingCoGuide) {
                const coGuideName = existingCoGuide.facultyId ? existingCoGuide.facultyId.name : "another faculty member";
                return res.status(400).json({
                    success: false,
                    message: `Scholar (${rollNo}) already has a registered Co-Guide (${coGuideName}). A Ph.D. scholar can only have one Co-Guide.`
                });
            }
        }

        const oldDocument = application.document;
        const pursuingDoc = application.pursuingDetails?.document;
        const awardedDoc = application.awardedDetails?.document;

        // Update fields
        Object.keys(data).forEach(key => {
            if (key !== 'status' && key !== 'facultyId' && key !== 'document' && key !== 'titleOfPhdWork' && key !== 'admissionOrAwardDate' && data[key] !== undefined) {
                application[key] = data[key];
            }
        });

        if (data.titleOfPhdWork !== undefined) {
            if (data.titleOfPhdWork.trim()) {
                application.titleOfPhdWork = data.titleOfPhdWork.trim();
            } else {
                application.titleOfPhdWork = undefined;
            }
        }

        application.rollNumber = rollNo;
        application.type = checkType;
        application.scholarStatus = checkScholarStatus;
        application.status = 'Pending'; // Resubmit
        application.hodComment = '';
        application.rndComment = '';

        if (req.file) {
            if (checkScholarStatus === 'Awarded') {
                const toDelete = new Set();
                if (awardedDoc && awardedDoc !== pursuingDoc) toDelete.add(awardedDoc);
                if (oldDocument && oldDocument !== pursuingDoc) toDelete.add(oldDocument);
                toDelete.forEach(p => deleteOldFile(p));
            } else {
                deleteOldFile(oldDocument);
                if (pursuingDoc && pursuingDoc !== oldDocument) deleteOldFile(pursuingDoc);
            }
            application.document = `/uploads/phdScholars/${req.file.filename}`;
        }

        const updatedDate = data.admissionDate || data.awardDate || data.admissionOrAwardDate;

        // Synchronize active milestone subdocument
        if (application.scholarStatus === 'Pursuing') {
            application.pursuingDetails = {
                academicYear: application.academicYear,
                admissionDate: updatedDate ? new Date(updatedDate) : (application.pursuingDetails?.admissionDate || application.admissionOrAwardDate),
                document: application.document,
                status: 'Pending',
                hodComment: '',
                rndComment: '',
                submittedAt: new Date()
            };
        } else if (application.scholarStatus === 'Awarded') {
            application.awardedDetails = {
                academicYear: application.academicYear,
                awardDate: updatedDate ? new Date(updatedDate) : (application.awardedDetails?.awardDate || application.admissionOrAwardDate),
                document: application.document,
                status: 'Pending',
                hodComment: '',
                rndComment: '',
                submittedAt: new Date()
            };
        }

        await application.save();

        res.json({ success: true, data: application });
    } catch (err) {
        if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
        console.error("Update PhdApplication Error:", err);
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Duplicate entry: A Ph.D. Scholar with this Title of Ph.D Work already exists."
            });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Mark an existing Pursuing Ph.D. Scholar as Awarded (milestone progression)
// @route   PUT /api/research/phd-scholar/:id/mark-awarded
// @access  Private (Faculty)
exports.markAsAwarded = async (req, res) => {
    try {
        const { id } = req.params;
        const { academicYear, awardDate, titleOfPhdWork } = req.body;

        const application = await PhdApplication.findById(id);
        if (!application) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(404).json({ success: false, message: "Ph.D. Scholar application not found." });
        }

        // Verify ownership
        if (application.facultyId.toString() !== req.user.userId) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(403).json({ success: false, message: "Not authorized to update this scholar record." });
        }

        // Check if already approved as Awarded
        if (application.scholarStatus === 'Awarded' && (application.status === 'Approved' || application.awardedDetails?.status === 'Approved')) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(400).json({ success: false, message: "This scholar has already been marked as Awarded and approved." });
        }

        if (!academicYear) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(400).json({ success: false, message: "Academic Year is required." });
        }

        // Validate Awarded Academic Year cannot be the same as Pursuing Academic Year
        const pursuingAcyId = (
            application.pursuingDetails?.academicYear?._id ||
            application.pursuingDetails?.academicYear ||
            application.academicYear?._id ||
            application.academicYear
        )?.toString();
        const awardedAcyId = (academicYear?._id || academicYear)?.toString();

        if (pursuingAcyId && awardedAcyId && pursuingAcyId === awardedAcyId) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(400).json({
                success: false,
                message: "Awarded Academic Year cannot be the same as the Pursuing Academic Year. A scholar cannot be admitted and awarded in the exact same academic year."
            });
        }

        if (!awardDate) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(400).json({ success: false, message: "Degree Award Date is required." });
        }

        const existingAwardedDoc = application.awardedDetails?.document;
        if (!req.file && !existingAwardedDoc) {
            return res.status(400).json({ success: false, message: "Degree Award letter/proceedings document is mandatory." });
        }

        const awardDateObj = new Date(awardDate);
        if (awardDateObj > new Date()) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(400).json({ success: false, message: "Degree Award Date cannot be in the future." });
        }

        // Check against admission date
        const admissionDate = application.pursuingDetails?.admissionDate || application.admissionOrAwardDate;
        if (admissionDate && awardDateObj <= new Date(admissionDate)) {
            if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
            return res.status(400).json({ 
                success: false, 
                message: `Ph.D. Award Date must be after the Admission Date (${new Date(admissionDate).toLocaleDateString('en-IN')}).` 
            });
        }

        // Validate and update Title of the Ph.D Work (optional, but unique across all entries)
        if (titleOfPhdWork !== undefined) {
            const checkTitle = titleOfPhdWork.trim();
            if (checkTitle) {
                const existingWithTitle = await PhdApplication.findOne({
                    _id: { $ne: application._id },
                    titleOfPhdWork: new RegExp(`^${escapeRegex(checkTitle)}$`, 'i')
                }).populate('facultyId', 'name institutionId');

                if (existingWithTitle) {
                    if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
                    const facultyName = existingWithTitle.facultyId ? existingWithTitle.facultyId.name : "another faculty member";
                    return res.status(400).json({
                        success: false,
                        message: `A Ph.D. Scholar entry with the title "${checkTitle}" already exists under ${facultyName}. Title of the Ph.D Work must be unique.`
                    });
                }
                application.titleOfPhdWork = checkTitle;
            } else {
                application.titleOfPhdWork = undefined;
            }
        }

        // If a new file is uploaded, remove previous awarded file from disk to avoid duplicate files
        if (req.file) {
            const pursuingDoc = application.pursuingDetails?.document;
            const filesToDelete = new Set();
            if (existingAwardedDoc && existingAwardedDoc !== pursuingDoc) {
                filesToDelete.add(existingAwardedDoc);
            }
            if (application.scholarStatus === 'Awarded' && application.document && application.document !== pursuingDoc) {
                filesToDelete.add(application.document);
            }
            filesToDelete.forEach(docPath => deleteOldFile(docPath));
        }

        const finalDoc = req.file ? `/uploads/phdScholars/${req.file.filename}` : existingAwardedDoc;

        // Preserve pursuingDetails if not previously set
        if (!application.pursuingDetails || !application.pursuingDetails.admissionDate) {
            application.pursuingDetails = {
                academicYear: application.academicYear,
                admissionDate: application.admissionOrAwardDate,
                document: application.document,
                status: application.status,
                hodComment: application.hodComment,
                rndComment: application.rndComment,
                submittedAt: application.createdAt
            };
        }

        // Update awardedDetails
        application.awardedDetails = {
            academicYear: academicYear,
            awardDate: awardDateObj,
            document: finalDoc,
            status: 'Pending',
            hodComment: '',
            rndComment: '',
            submittedAt: new Date()
        };

        // Update root fields for active approval cycle
        application.scholarStatus = 'Awarded';
        application.status = 'Pending';
        application.academicYear = academicYear;
        application.document = finalDoc;
        application.hodComment = '';
        application.rndComment = '';

        await application.save();

        // Send notification to HOD
        try {
            const { getReportingBossId } = require('../hierarchy/reportingBoss.helper');
            const NotificationService = require('../notification/notification.service');
            const EmployeeModel = require('../employee/employee.model');

            const emp = await EmployeeModel.findById(req.user.userId);
            const bossUserId = await getReportingBossId(req.user.userId);
            if (bossUserId) {
                await NotificationService.sendNotification({
                    recipientId: bossUserId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: 'INFO',
                    title: 'Ph.D. Award Milestone Submitted',
                    message: `${emp?.name || 'A faculty member'} has marked scholar ${application.studentName} (${application.rollNumber}) as Awarded. Pending your review.`,
                    link: `/hod/research-approvals`
                });
            }
        } catch (notifErr) {
            console.error("Failed to send milestone notification:", notifErr);
        }

        res.json({ success: true, message: "Ph.D. Awarded milestone submitted successfully!", data: application });
    } catch (err) {
        if (req.file) deleteOldFile(`/uploads/phdScholars/${req.file.filename}`);
        console.error("Mark As Awarded Error:", err);
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
            .populate('pursuingDetails.academicYear', 'year')
            .populate('awardedDetails.academicYear', 'year')
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
            .populate('academicYear', 'year')
            .populate('pursuingDetails.academicYear', 'year')
            .populate('awardedDetails.academicYear', 'year');
            
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
            .populate('pursuingDetails.academicYear', 'year')
            .populate('awardedDetails.academicYear', 'year')
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
            status: 'Pending'
        })
        .populate('facultyId', 'name institutionId department')
        .populate('academicYear', 'year')
        .populate('pursuingDetails.academicYear', 'year')
        .populate('awardedDetails.academicYear', 'year');
        
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

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected';
        
        const application = await PhdApplication.findById(id);
        if (!application) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        application.status = status;
        application.hodComment = comment;

        // Synchronize with active milestone subdocument
        if (application.scholarStatus === 'Awarded' && application.awardedDetails) {
            application.awardedDetails.status = status;
            application.awardedDetails.hodComment = comment;
        } else if (application.pursuingDetails) {
            application.pursuingDetails.status = status;
            application.pursuingDetails.hodComment = comment;
        }

        await application.save();

        try {
            const NotificationService = require('../../modules/notification/notification.service');
            const targetFacultyId = application.facultyId || application.facultyId?._id;
            
            if (targetFacultyId) {
                await NotificationService.sendNotification({
                    recipientId: targetFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: action === 'Approve' ? 'SUCCESS' : 'ERROR',
                    title: `Phd Scholar ${action}d by HOD`,
                    message: `Your Phd Scholar (${application.studentName}) has been ${action.toLowerCase()}d by HOD.`,
                    link: '/research/phd-scholars'
                });
            }

            if (action === 'Approve') {
                const Role = require('../../modules/role/role.model');
                const UserAppRole = require('../../modules/userAppRole/userAppRole.model');
                const rndRoles = await Role.find({ key: { $in: ['RESEARCH_DEAN', 'RESEARCH_COORDINATOR'] } });
                const rndRoleIds = rndRoles.map(r => r._id);
                const rndAdmins = await UserAppRole.find({ role: { $in: rndRoleIds } }).distinct('userId');
                
                for (const adminId of rndAdmins) {
                    await NotificationService.sendNotification({
                        recipientId: adminId,
                        senderId: req.user.userId,
                        module: 'Research',
                        type: 'INFO',
                        title: `New Phd Scholar for R&D Approval`,
                        message: `A Phd Scholar application (${application.studentName}) is pending your approval.`,
                        link: '/research-dean/approvals'
                    });
                }
            }
        } catch (notifErr) {
            console.error("Failed to send notification:", notifErr);
        }

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
            .populate('academicYear', 'year')
            .populate('pursuingDetails.academicYear', 'year')
            .populate('awardedDetails.academicYear', 'year');
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
        
        const application = await PhdApplication.findById(id);
        if (!application) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        application.status = status;
        application.rndComment = comment;

        // Synchronize with active milestone subdocument
        if (application.scholarStatus === 'Awarded' && application.awardedDetails) {
            application.awardedDetails.status = action === 'Approve' ? 'Approved' : 'Rejected';
            application.awardedDetails.rndComment = comment;
        } else if (application.pursuingDetails) {
            application.pursuingDetails.status = action === 'Approve' ? 'Approved' : 'Rejected';
            application.pursuingDetails.rndComment = comment;
        }

        await application.save();

        try {
            const NotificationService = require('../../modules/notification/notification.service');
            const targetFacultyId = application.facultyId || application.facultyId?._id;
            
            if (targetFacultyId) {
                await NotificationService.sendNotification({
                    recipientId: targetFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: action === 'Approve' ? 'SUCCESS' : 'ERROR',
                    title: `Phd Scholar ${action}d by R&D`,
                    message: `Your Phd Scholar (${application.studentName}) has been ${action.toLowerCase()}d by R&D.`,
                    link: '/research/phd-scholars'
                });
            }
        } catch (notifErr) {
            console.error("Failed to send notification:", notifErr);
        }

        res.json({ success: true, data: application });
    } catch (err) {
        console.error("rndAction Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
