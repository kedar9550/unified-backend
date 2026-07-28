const ResourceUtilization = require('./ResourceUtilization.model');
const Contribution = require('../Contribution/Contribution.model');
const Employee = require('../employee/employee.model');
const AcademicYear = require('../academicYear/academicYear.model');
const { isFutureDate, isDateWithinAcademicYear } = require('../../utils/validationHelper');
const { getHODDepartments } = require('../../utils/hodHelper');
const { syncAppraisalOnResourceUtilizationRejection } = require('../../utils/appraisalSyncHelper');
const fs = require('fs');
const path = require('path');

const normalizeDurationToWeeks = (duration) => {
    if (typeof duration === 'number') {
        return Math.round(duration / 7);
    }
    if (typeof duration === 'string') {
        const dLower = duration.toLowerCase();
        if (dLower.includes('week')) {
            return parseInt(dLower) || 0;
        }
        if (dLower.includes('day')) {
            return Math.round(parseInt(dLower) / 7) || 0;
        }
        return parseInt(dLower) || 0;
    }
    return 0;
};

// @desc    Submit new resource utilization activity (saves as Draft by default)
// @route   POST /api/value-addition/resource-utilization
// @access  Private (Faculty)
exports.createResourceUtilization = async (req, res) => {
    try {
        const data = req.body;

        if (data.activityCategory === "FDP" && data.activityType === "FDP Participant") {
            data.organizationName = data.courseFdpName;
        }

        // Validate mandatory text fields
        if (!data.academicYear || !data.activityCategory || !data.activityType || !data.organizationName || !data.eventStartDate || !data.eventEndDate) {
            return res.status(400).json({ success: false, message: "Please fill all required fields." });
        }

        const role = (data.activityType || '').toLowerCase();
        const isResourcePerson = role.includes("resource person") || role.includes("resourceperson");
        const isParticipant = role.includes("participant") || role.includes("participated");
        const isOrganized = !isResourcePerson && !isParticipant;

        // CREATE: Validate role-specific mandatory fields
        if (isResourcePerson) {
            if (!data.numberOfSessions) {
                return res.status(400).json({ success: false, message: "Number of Sessions Conducted is required for Resource Person role." });
            }
            const sessions = parseInt(data.numberOfSessions);
            if (isNaN(sessions) || sessions <= 0) {
                return res.status(400).json({ success: false, message: "Number of Sessions Conducted must be a positive integer greater than 0." });
            }
        } else if (isParticipant) {
            if (!data.numberOfDaysParticipated) {
                return res.status(400).json({ success: false, message: "Number of Days Participated is required for Participant role." });
            }
            const days = parseInt(data.numberOfDaysParticipated);
            if (isNaN(days) || days <= 0) {
                return res.status(400).json({ success: false, message: "Number of Days Participated must be a positive integer greater than 0." });
            }
        } else if (isOrganized) {
            if (!data.numberOfDaysOrganized) {
                return res.status(400).json({ success: false, message: "Number of Days Organized is required." });
            }
            const days = parseInt(data.numberOfDaysOrganized);
            if (isNaN(days) || days <= 0) {
                return res.status(400).json({ success: false, message: "Number of Days Organized must be a positive integer greater than 0." });
            }
        }

        // FDP Participant specific validation
        if (data.activityCategory === "FDP" && data.activityType === "FDP Participant") {
            if (!data.courseFdpName) {
                return res.status(400).json({ success: false, message: "Course / FDP Name is required." });
            }
            if (!data.organizingInstitutionCategory) {
                return res.status(400).json({ success: false, message: "Organizing Institution Category is required." });
            }
            const allowedCategories = [
                "UGC",
                "AICTE",
                "IIT",
                "IIM",
                "NIT",
                "MHRD R&D Lab",
                "NITTTR",
                "NIPER",
                "ICMR",
                "Govt. University",
                "NIRF Ranked Institute (Below 200)",
                "NPTEL",
                "Other / Host Institute"
            ];
            if (!allowedCategories.includes(data.organizingInstitutionCategory)) {
                return res.status(400).json({ success: false, message: "Invalid Organizing Institution Category." });
            }
            if (!data.location) {
                return res.status(400).json({ success: false, message: "Location (City, State) is required." });
            }
            if (data.organizingInstitutionCategory === "MHRD R&D Lab" && !data.labName) {
                return res.status(400).json({ success: false, message: "Lab Name is required." });
            }
            if (data.organizingInstitutionCategory === "Govt. University" && !data.universityName) {
                return res.status(400).json({ success: false, message: "University Name is required." });
            }
            if (data.organizingInstitutionCategory === "NIRF Ranked Institute (Below 200)") {
                if (!data.instituteName) {
                    return res.status(400).json({ success: false, message: "Institute Name is required." });
                }
                if (data.nirfRank === undefined || data.nirfRank === null || data.nirfRank === "") {
                    return res.status(400).json({ success: false, message: "NIRF Rank is required." });
                }
                const rank = parseInt(data.nirfRank);
                if (isNaN(rank) || rank <= 0 || rank >= 200) {
                    return res.status(400).json({ success: false, message: "NIRF Rank must be a positive integer less than 200." });
                }
            }
        }

        // Validate duplicates (same organization/event name in same category and academic year unless rejected)
        if (data.organizationName) {
            const existing = await ResourceUtilization.findOne({
                facultyId: req.user.userId,
                academicYear: data.academicYear,
                activityCategory: data.activityCategory,
                organizationName: { $regex: new RegExp("^" + data.organizationName.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                status: { $ne: 'Rejected' },
                removedFromAppraisal: { $ne: true }
            });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A duplicate entry for this academic year and activity category already exists with the same organization/event name: "${data.organizationName}".`
                });
            }
        }

        // Cross-module NPTEL duplicate check
        if (data.activityCategory === "FDP" && data.activityType === "FDP Participant" && data.organizingInstitutionCategory === "NPTEL") {
            const existingContributions = await Contribution.find({
                facultyId: req.user.userId,
                academicYear: data.academicYear,
                category: 11,
                status: { $ne: 'Rejected' },
                removedFromAppraisal: { $ne: true }
            });

            const certNoInput = data.certificateNumber ? data.certificateNumber.trim().toLowerCase() : "";
            const courseNameInput = data.courseFdpName ? data.courseFdpName.trim().toLowerCase() : "";

            let conflictFound = false;
            for (const c of existingContributions) {
                const certNoExist = c.certificateNumber ? c.certificateNumber.trim().toLowerCase() : "";
                const courseNameExist = c.courseName ? c.courseName.trim().toLowerCase() : "";

                if (certNoInput && certNoExist) {
                    if (certNoInput === certNoExist) {
                        conflictFound = true;
                        break;
                    }
                } else if (courseNameInput && courseNameExist) {
                    if (courseNameInput === courseNameExist) {
                        conflictFound = true;
                        break;
                    }
                }
            }

            if (conflictFound) {
                return res.status(400).json({
                    success: false,
                    message: "This NPTEL certificate is already claimed in Metric 3.2. A certificate can be considered only in one metric."
                });
            }
        }

        // Validate proof upload
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Relevant proof upload is mandatory." });
        }

        // Validate file size (500KB limit)
        if (req.file.size > 500 * 1024) {
            return res.status(400).json({
                success: false,
                message: `Proof document is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.`
            });
        }

        // Validate dates (not in future)
        if (isFutureDate(data.eventStartDate) || isFutureDate(data.eventEndDate)) {
            return res.status(400).json({ success: false, message: "Activity dates cannot be in the future." });
        }

        if (new Date(data.eventStartDate) >= new Date(data.eventEndDate)) {
            return res.status(400).json({ success: false, message: "Event End Date must be greater than Event Start Date." });
        }

        const ayRecord = await AcademicYear.findById(data.academicYear);
        if (!ayRecord) {
            return res.status(400).json({ success: false, message: "Invalid Academic Year selected." });
        }
        const academicYearStr = ayRecord.year;

        if (!isDateWithinAcademicYear(data.eventStartDate, academicYearStr) || !isDateWithinAcademicYear(data.eventEndDate, academicYearStr)) {
            return res.status(400).json({
                success: false,
                message: `Activity dates must fall within the selected Academic Year (${academicYearStr}).`
            });
        }

        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        const filename = `${req.file.fieldname}-${unique}${path.extname(req.file.originalname)}`;
        const uploadDir = path.join(__dirname, '../../uploads/resource-utilization');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const filepath = path.join(uploadDir, filename);
        fs.writeFileSync(filepath, req.file.buffer);

        const resourceUtilization = new ResourceUtilization({
            facultyId: req.user.userId,
            academicYear: data.academicYear,
            activityCategory: data.activityCategory,
            activityType: data.activityType,
            organizationName: data.organizationName,
            eventStartDate: data.eventStartDate,
            eventEndDate: data.eventEndDate,
            remarks: data.remarks || "",
            numberOfSessions: isResourcePerson && data.numberOfSessions ? parseInt(data.numberOfSessions) : undefined,
            numberOfDaysParticipated: isParticipant && data.numberOfDaysParticipated ? parseInt(data.numberOfDaysParticipated) : undefined,
            numberOfDaysOrganized: isOrganized && data.numberOfDaysOrganized ? parseInt(data.numberOfDaysOrganized) : undefined,
            proof: `/uploads/resource-utilization/${filename}`,
            status: 'Draft', // Always save as Draft first
            certificateNumber: data.certificateNumber || undefined,

            // new FDP fields
            courseFdpName: data.activityCategory === "FDP" && data.activityType === "FDP Participant" ? data.courseFdpName : undefined,
            organizingInstitutionCategory: data.activityCategory === "FDP" && data.activityType === "FDP Participant" ? data.organizingInstitutionCategory : undefined,
            location: data.activityCategory === "FDP" && data.activityType === "FDP Participant" ? data.location : undefined,
            labName: data.activityCategory === "FDP" && data.activityType === "FDP Participant" && data.organizingInstitutionCategory === "MHRD R&D Lab" ? data.labName : undefined,
            universityName: data.activityCategory === "FDP" && data.activityType === "FDP Participant" && data.organizingInstitutionCategory === "Govt. University" ? data.universityName : undefined,
            instituteName: data.activityCategory === "FDP" && data.activityType === "FDP Participant" && (data.organizingInstitutionCategory === "NIRF Ranked Institute (Below 200)" || data.organizingInstitutionCategory === "Other / Host Institute") ? data.instituteName : undefined,
            nirfRank: data.activityCategory === "FDP" && data.activityType === "FDP Participant" && data.organizingInstitutionCategory === "NIRF Ranked Institute (Below 200)" ? parseInt(data.nirfRank) : undefined
        });

        await resourceUtilization.save();
        res.status(201).json({ success: true, data: resourceUtilization });
    } catch (err) {
        console.error("Create Resource Utilization Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own resource utilization entries (optional filtering by academicYear)
// @route   GET /api/value-addition/resource-utilization
// @access  Private (Faculty)
exports.getMyResourceUtilizations = async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        if (req.query.academicYear) {
            query.academicYear = req.query.academicYear;
        }

        const list = await ResourceUtilization.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update resource utilization entry (only if status is Draft)
// @route   PUT /api/value-addition/resource-utilization/:id
// @access  Private (Faculty)
exports.updateResourceUtilization = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const record = await ResourceUtilization.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        if (record.facultyId.toString() !== req.user.userId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to update this record." });
        }

        // Allow editing of Draft OR Rejected records.
        // Approved and Pending at HOD records are locked.
        if (record.status !== 'Draft' && record.status !== 'Rejected') {
            return res.status(400).json({ success: false, message: "Only Draft or Rejected entries can be edited." });
        }

        // Track whether this was a rejected record before we change anything
        const wasRejected = record.status === 'Rejected';

        const category = data.activityCategory || record.activityCategory;
        const type = data.activityType || record.activityType;

        if (category === "FDP" && type === "FDP Participant") {
            const courseFdpName = data.courseFdpName !== undefined ? data.courseFdpName : record.courseFdpName;
            if (courseFdpName) {
                data.organizationName = courseFdpName;
            }
        }

        // Validate dates if sent
        if (data.eventStartDate && isFutureDate(data.eventStartDate)) {
            return res.status(400).json({ success: false, message: "Event Start Date cannot be in the future." });
        }
        if (data.eventEndDate && isFutureDate(data.eventEndDate)) {
            return res.status(400).json({ success: false, message: "Event End Date cannot be in the future." });
        }
        const from = data.eventStartDate || record.eventStartDate;
        const to = data.eventEndDate || record.eventEndDate;
        if (from && to && new Date(from) >= new Date(to)) {
            return res.status(400).json({ success: false, message: "To Date must be greater than From Date." });
        }

        

        const academicYearId = data.academicYear || record.academicYear;
        const ayRecord = await AcademicYear.findById(academicYearId);
        if (!ayRecord) {
            return res.status(400).json({ success: false, message: "Invalid Academic Year." });
        }
        const academicYearStr = ayRecord.year;

        if (from && !isDateWithinAcademicYear(from, academicYearStr)) {
            return res.status(400).json({ success: false, message: `From Date must fall within the selected Academic Year (${academicYearStr}).` });
        }
        if (to && !isDateWithinAcademicYear(to, academicYearStr)) {
            return res.status(400).json({ success: false, message: `To Date must fall within the selected Academic Year (${academicYearStr}).` });
        }

        // Validate role-specific mandatory fields
        const role = (type || '').toLowerCase();
        const isResourcePerson = role.includes("resource person") || role.includes("resourceperson");
        const isParticipant = role.includes("participant") || role.includes("participated");
        const isOrganized = !isResourcePerson && !isParticipant;

        const sessions = data.numberOfSessions !== undefined ? data.numberOfSessions : record.numberOfSessions;
        const daysPart = data.numberOfDaysParticipated !== undefined ? data.numberOfDaysParticipated : record.numberOfDaysParticipated;
        const daysOrg = data.numberOfDaysOrganized !== undefined ? data.numberOfDaysOrganized : record.numberOfDaysOrganized;

        if (isResourcePerson) {
            if (!sessions) {
                return res.status(400).json({ success: false, message: "Number of Sessions Conducted is required for Resource Person role." });
            }
            const sVal = parseInt(sessions);
            if (isNaN(sVal) || sVal <= 0) {
                return res.status(400).json({ success: false, message: "Number of Sessions Conducted must be a positive integer greater than 0." });
            }
        }
        if (isParticipant) {
            if (!daysPart) {
                return res.status(400).json({ success: false, message: "Number of Days Participated is required for Participant role." });
            }
            const dVal = parseInt(daysPart);
            if (isNaN(dVal) || dVal <= 0) {
                return res.status(400).json({ success: false, message: "Number of Days Participated must be a positive integer greater than 0." });
            }
        }
        if (isOrganized) {
            if (!daysOrg) {
                return res.status(400).json({ success: false, message: "Number of Days Organized is required." });
            }
            const dVal = parseInt(daysOrg);
            if (isNaN(dVal) || dVal <= 0) {
                return res.status(400).json({ success: false, message: "Number of Days Organized must be a positive integer greater than 0." });
            }
        }

        // FDP Participant specific validation
        if (category === "FDP" && type === "FDP Participant") {
            const courseFdpName = data.courseFdpName !== undefined ? data.courseFdpName : record.courseFdpName;
            const organizingInstitutionCategory = data.organizingInstitutionCategory !== undefined ? data.organizingInstitutionCategory : record.organizingInstitutionCategory;
            const location = data.location !== undefined ? data.location : record.location;
            const labName = data.labName !== undefined ? data.labName : record.labName;
            const universityName = data.universityName !== undefined ? data.universityName : record.universityName;
            const instituteName = data.instituteName !== undefined ? data.instituteName : record.instituteName;
            const nirfRank = data.nirfRank !== undefined ? data.nirfRank : record.nirfRank;

            if (!courseFdpName) {
                return res.status(400).json({ success: false, message: "Course / FDP Name is required." });
            }
            if (!organizingInstitutionCategory) {
                return res.status(400).json({ success: false, message: "Organizing Institution Category is required." });
            }
            const allowedCategories = [
                "UGC",
                "AICTE",
                "IIT",
                "IIM",
                "NIT",
                "MHRD R&D Lab",
                "NITTTR",
                "NIPER",
                "ICMR",
                "Govt. University",
                "NIRF Ranked Institute (Below 200)",
                "NPTEL",
                "Other / Host Institute"
            ];
            if (!allowedCategories.includes(organizingInstitutionCategory)) {
                return res.status(400).json({ success: false, message: "Invalid Organizing Institution Category." });
            }
            if (!data.location && !record.location) {
                return res.status(400).json({ success: false, message: "Location (City, State) is required." });
            }
            if (organizingInstitutionCategory === "MHRD R&D Lab" && !labName) {
                return res.status(400).json({ success: false, message: "Lab Name is required." });
            }
            if (organizingInstitutionCategory === "Govt. University" && !universityName) {
                return res.status(400).json({ success: false, message: "University Name is required." });
            }
            if (organizingInstitutionCategory === "NIRF Ranked Institute (Below 200)") {
                if (!instituteName) {
                    return res.status(400).json({ success: false, message: "Institute Name is required." });
                }
                if (nirfRank === undefined || nirfRank === null || nirfRank === "") {
                    return res.status(400).json({ success: false, message: "NIRF Rank is required." });
                }
                const rank = parseInt(nirfRank);
                if (isNaN(rank) || rank <= 0 || rank >= 200) {
                    return res.status(400).json({ success: false, message: "NIRF Rank must be a positive integer less than 200." });
                }
            }
        }

        // Validate duplicates (same organization/event name in same category and academic year unless rejected)
        const orgName = data.organizationName || record.organizationName;
        const academicYearVal = data.academicYear || record.academicYear;
        if (orgName) {
            const existing = await ResourceUtilization.findOne({
                _id: { $ne: id },
                facultyId: req.user.userId,
                academicYear: academicYearVal,
                activityCategory: category,
                organizationName: { $regex: new RegExp("^" + orgName.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                status: { $ne: 'Rejected' },
                removedFromAppraisal: { $ne: true }
            });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A duplicate entry for this academic year and activity category already exists with the same organization/event name: "${orgName}".`
                });
            }
        }

        // Cross-module NPTEL duplicate check
        if (category === "FDP" && type === "FDP Participant" && (data.organizingInstitutionCategory || record.organizingInstitutionCategory) === "NPTEL") {
            const existingContributions = await Contribution.find({
                facultyId: req.user.userId,
                academicYear: data.academicYear || record.academicYear,
                category: 11,
                status: { $ne: 'Rejected' },
                removedFromAppraisal: { $ne: true }
            });

            const certNoInput = data.certificateNumber !== undefined ? data.certificateNumber : record.certificateNumber;
            const certNoInputNorm = certNoInput ? certNoInput.trim().toLowerCase() : "";

            const courseFdpNameVal = data.courseFdpName !== undefined ? data.courseFdpName : record.courseFdpName;
            const courseNameInput = courseFdpNameVal ? courseFdpNameVal.trim().toLowerCase() : "";

            let conflictFound = false;
            for (const c of existingContributions) {
                const certNoExist = c.certificateNumber ? c.certificateNumber.trim().toLowerCase() : "";
                const courseNameExist = c.courseName ? c.courseName.trim().toLowerCase() : "";

                if (certNoInputNorm && certNoExist) {
                    if (certNoInputNorm === certNoExist) {
                        conflictFound = true;
                        break;
                    }
                } else {
                    const nameMatch = courseNameInput === courseNameExist;
                    if (nameMatch) {
                        conflictFound = true;
                        break;
                    }
                }
            }

            if (conflictFound) {
                return res.status(400).json({
                    success: false,
                    message: "This NPTEL certificate is already claimed in Metric 3.2. A certificate can be considered only in one metric."
                });
            }
        }

        // Update fields
        record.academicYear = data.academicYear || record.academicYear;
        record.activityCategory = data.activityCategory || record.activityCategory;
        record.activityType = data.activityType || record.activityType;
        record.organizationName = data.organizationName || record.organizationName;
        record.eventStartDate = from;
        record.eventEndDate = to;
        record.remarks = data.remarks !== undefined ? data.remarks : record.remarks;
        record.numberOfSessions = isResourcePerson ? (data.numberOfSessions !== undefined ? (data.numberOfSessions ? parseInt(data.numberOfSessions) : undefined) : record.numberOfSessions) : undefined;
        record.numberOfDaysParticipated = isParticipant ? (data.numberOfDaysParticipated !== undefined ? (data.numberOfDaysParticipated ? parseInt(data.numberOfDaysParticipated) : undefined) : record.numberOfDaysParticipated) : undefined;
        record.numberOfDaysOrganized = isOrganized ? (data.numberOfDaysOrganized !== undefined ? (data.numberOfDaysOrganized ? parseInt(data.numberOfDaysOrganized) : undefined) : record.numberOfDaysOrganized) : undefined;
        record.certificateNumber = data.certificateNumber !== undefined ? data.certificateNumber : record.certificateNumber;

        if (category === "FDP" && type === "FDP Participant") {
            record.courseFdpName = data.courseFdpName !== undefined ? data.courseFdpName : record.courseFdpName;
            record.organizingInstitutionCategory = data.organizingInstitutionCategory !== undefined ? data.organizingInstitutionCategory : record.organizingInstitutionCategory;
            record.location = data.location !== undefined ? data.location : record.location;
            
            const finalOrgCategory = data.organizingInstitutionCategory !== undefined ? data.organizingInstitutionCategory : record.organizingInstitutionCategory;
            
            record.labName = finalOrgCategory === "MHRD R&D Lab" ? (data.labName !== undefined ? data.labName : record.labName) : undefined;
            record.universityName = finalOrgCategory === "Govt. University" ? (data.universityName !== undefined ? data.universityName : record.universityName) : undefined;
            
            if (finalOrgCategory === "NIRF Ranked Institute (Below 200)") {
                record.instituteName = data.instituteName !== undefined ? data.instituteName : record.instituteName;
                const finalNirfRank = data.nirfRank !== undefined ? data.nirfRank : record.nirfRank;
                record.nirfRank = finalNirfRank ? parseInt(finalNirfRank) : undefined;
            } else if (finalOrgCategory === "Other / Host Institute") {
                record.instituteName = data.instituteName !== undefined ? data.instituteName : record.instituteName;
                record.nirfRank = undefined;
            } else {
                record.instituteName = undefined;
                record.nirfRank = undefined;
            }
        } else {
            record.courseFdpName = undefined;
            record.organizingInstitutionCategory = undefined;
            record.location = undefined;
            record.labName = undefined;
            record.universityName = undefined;
            record.instituteName = undefined;
            record.nirfRank = undefined;
        }

        if (req.file) {
            if (req.file.size > 500 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: `Proof document is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.`
                });
            }
            if (record.proof) {
                const oldPath = path.join(__dirname, '../..', record.proof);
                if (fs.existsSync(oldPath)) {
                    try {
                        fs.unlinkSync(oldPath);
                    } catch (e) {
                        console.error('Error deleting old proof file:', e);
                    }
                }
            }
            
            const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
            const filename = `${req.file.fieldname}-${unique}${path.extname(req.file.originalname)}`;
            const uploadDir = path.join(__dirname, '../../uploads/resource-utilization');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const filepath = path.join(uploadDir, filename);
            fs.writeFileSync(filepath, req.file.buffer);

            record.proof = `/uploads/resource-utilization/${filename}`;
        }

        // If the faculty edited a Rejected record, transition it back to Draft so it can be re-submitted.
        // HOD remarks (hodComment) are intentionally preserved for faculty reference.
        // This is the ONLY place where Rejected → Draft should ever happen.
        if (wasRejected) {
            record.status = 'Draft';
        }

        await record.save();
        res.json({ success: true, data: record });
    } catch (err) {
        console.error("Update Resource Utilization Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Delete resource utilization entry (only if status is Draft)
// @route   DELETE /api/value-addition/resource-utilization/:id
// @access  Private (Faculty)
exports.deleteResourceUtilization = async (req, res) => {
    try {
        const { id } = req.params;
        const record = await ResourceUtilization.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        if (record.facultyId.toString() !== req.user.userId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to delete this record." });
        }

        if (record.status === 'Rejected') {
            record.removedFromAppraisal = true;
            await record.save();
            return res.json({ success: true, message: "Record removed from appraisal." });
        } else if (record.status !== 'Draft') {
            return res.status(400).json({ success: false, message: "Only draft or rejected entries can be deleted/removed." });
        }

        await ResourceUtilization.findByIdAndDelete(id);
        res.json({ success: true, message: "Record deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Bulk submit all drafts of an academic year
// @route   POST /api/value-addition/resource-utilization/submit-academic-year
// @access  Private (Faculty)
exports.submitAcademicYear = async (req, res) => {
    try {
        const { academicYear } = req.body;
        const query = { facultyId: req.user.userId, status: 'Draft' };
        if (academicYear) {
            query.academicYear = academicYear;
        }

        const result = await ResourceUtilization.updateMany(
            query,
            { status: 'Pending at HOD' }
        );

        res.json({
            success: true,
            message: `Successfully submitted ${result.modifiedCount} activities for approval.`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get entries for HOD's department (filters: status, academicYear)
// @route   GET /api/value-addition/resource-utilization/pending-hod
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

        // Only show Pending at HOD, Approved, or Rejected records to HOD (exclude Drafts!)
        const query = {
            facultyId: { $in: facultyIds },
            status: { $in: ['Pending at HOD', 'Approved', 'Rejected'] }
        };

        if (req.query.status && req.query.status !== 'All') {
            query.status = req.query.status;
        }

        if (req.query.academicYear) {
            query.academicYear = req.query.academicYear;
        }

        const list = await ResourceUtilization.find(query)
            .populate('facultyId', 'name institutionId department coreDepartment profileImage')
            .populate('academicYear', 'year')
            .sort({ createdAt: -1 }).lean();

        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD action (Approve / Reject)
// @route   PUT /api/value-addition/resource-utilization/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        if (!action || !['Approve', 'Reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Please specify a valid action (Approve or Reject)." });
        }

        const record = await ResourceUtilization.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        record.status = action === 'Approve' ? 'Approved' : 'Rejected';
        record.hodComment = comment || "";

        await record.save();

        // Sync appraisal status if rejection
        if (action === 'Reject') {
            await syncAppraisalOnResourceUtilizationRejection([id]);
        }

        res.json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD bulk action (Approve / Reject Selected)
// @route   POST /api/value-addition/resource-utilization/hod-bulk-action
// @access  Private (HOD)
exports.bulkHODAction = async (req, res) => {
    try {
        const { ids, action, comment } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: "A list of entry IDs is required." });
        }
        if (!action || !['Approve', 'Reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Please specify a valid action (Approve or Reject)." });
        }

        const status = action === 'Approve' ? 'Approved' : 'Rejected';
        const updateData = { status, hodComment: comment || "" };

        await ResourceUtilization.updateMany(
            { _id: { $in: ids } },
            updateData
        );

        // Sync appraisal status if rejection
        if (action === 'Reject') {
            await syncAppraisalOnResourceUtilizationRejection(ids);
        }

        res.json({
            success: true,
            message: `Successfully processed ${ids.length} entries as ${action === 'Approve' ? 'Approved' : 'Rejected'}.`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
