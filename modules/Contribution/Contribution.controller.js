const Contribution = require('./Contribution.model');
const ContributionCategory = require('./ContributionCategory.model');
const ResourceUtilization = require('../ResourceUtilization/ResourceUtilization.model');
const Employee = require('../employee/employee.model');
const AcademicYear = require('../academicYear/academicYear.model');
const { isFutureDate, isDateWithinAcademicYear, isValidURL } = require('../../utils/validationHelper');
const { getHODDepartments } = require('../../utils/hodHelper');
const { syncAppraisalOnContributionRejection } = require('../../utils/appraisalSyncHelper');
const { syncAppraisalTotals } = require('../../utils/appraisalPointSync');
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

// Validate fields based on Category
const validateCategoryFields = (category, data, academicYearStr) => {
    const cat = parseInt(category);
    switch (cat) {
        case 1:
            if (!data.memberType || !data.organizationName || !data.fromDate || !data.toDate) {
                return "Member Type, Organization Name, From Date, and To Date are mandatory for Category 1.";
            }
            if (new Date(data.fromDate) > new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate)) {
                return "From Date cannot be in the future.";
            }

            break;
        case 2:
            if (!data.journalName || !data.journalType || !data.fromDate || !data.toDate) {
                return "Journal Name, Journal Type, From Date, and To Date are mandatory for Category 2.";
            }
            if (new Date(data.fromDate) > new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate)) {
                return "From Date cannot be in the future.";
            }

            break;
        case 3:
            if (!data.journalName || !data.journalType || !data.fromDate || !data.toDate) {
                return "Journal Name, Journal Type, From Date, and To Date are mandatory for Category 3.";
            }
            if (new Date(data.fromDate) > new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate)) {
                return "From Date cannot be in the future.";
            }

            break;
        case 4:
        case 5:
            if (!data.awardName || !data.awardDate || !data.awardingAgency) {
                return "Award Name, Awarding Agency, and Award Date are mandatory.";
            }
            if (isFutureDate(data.awardDate)) {
                return "Award Date cannot be in the future.";
            }
            if (!isDateWithinAcademicYear(data.awardDate, academicYearStr)) {
                return `Award Date must fall within the selected Academic Year (${academicYearStr}).`;
            }
            break;
        case 6:
            if (!data.courseName || !data.url) {
                return "Course Name and URL are mandatory.";
            }
            if (!isValidURL(data.url)) {
                return "Invalid URL format. Please provide a valid HTTP or HTTPS URL.";
            }
            break;
        case 7:
            if (!data.certificationName || !data.fromDate || !data.toDate) {
                return "Certification Name, From Date, and To Date are mandatory.";
            }
            if (new Date(data.fromDate) > new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate) || isFutureDate(data.toDate)) {
                return "Dates cannot be in the future.";
            }
            if (!isDateWithinAcademicYear(data.fromDate, academicYearStr) || !isDateWithinAcademicYear(data.toDate, academicYearStr)) {
                return `Dates must fall within the selected Academic Year (${academicYearStr}).`;
            }
            break;
        case 8:
            if (!data.eventName || !data.eventType || !data.studentNames || !data.eventDate) {
                return "Event Name, Event Type, Student Names, and Event Date are mandatory.";
            }
            if (isFutureDate(data.eventDate)) {
                return "Event Date cannot be in the future.";
            }
            if (!isDateWithinAcademicYear(data.eventDate, academicYearStr)) {
                return `Event Date must fall within the selected Academic Year (${academicYearStr}).`;
            }
            break;
        case 9:
            if (!data.articleTitle || !data.publicationName || !data.publicationDate) {
                return "Article Title, Publication Name, and Publication Date are mandatory.";
            }
            if (isFutureDate(data.publicationDate)) {
                return "Publication Date cannot be in the future.";
            }
            if (!isDateWithinAcademicYear(data.publicationDate, academicYearStr)) {
                return `Publication Date must fall within the selected Academic Year (${academicYearStr}).`;
            }
            break;
        case 10:
            if (!data.facilityName || !data.contributionType) {
                return "Facility Name and Contribution Type are mandatory.";
            }
            if (data.contributionType === "Maintenance") {
                if (!data.fromDate || !data.toDate) return "From Date and To Date are mandatory for Maintenance.";
                if (new Date(data.fromDate) > new Date(data.toDate)) return "To Date must be greater than From Date.";
                if (isFutureDate(data.fromDate) || isFutureDate(data.toDate)) return "Dates cannot be in the future.";
                if (!isDateWithinAcademicYear(data.fromDate, academicYearStr) || !isDateWithinAcademicYear(data.toDate, academicYearStr)) return `Dates must fall within the selected Academic Year (${academicYearStr}).`;
            } else if (data.contributionType === "Establishment") {
                if (!data.fromDate) return "Establishment Date is mandatory.";
                if (isFutureDate(data.fromDate)) return "Date cannot be in the future.";
                if (!isDateWithinAcademicYear(data.fromDate, academicYearStr)) return `Date must fall within the selected Academic Year (${academicYearStr}).`;
            }
            break;
        case 11:
            if (!data.courseName || !data.duration) {
                return "Course Name and Duration are mandatory.";
            }
            if (!["12 Weeks", "8 Weeks", "4 Weeks"].includes(data.duration)) {
                return "Invalid duration selected. Must be '12 Weeks', '8 Weeks', or '4 Weeks'.";
            }
            break;
        case 12:
            if (!data.courseName || !data.fromDate || !data.toDate) {
                return "Course Name, From Date, and To Date are mandatory.";
            }
            if (new Date(data.fromDate) > new Date(data.toDate)) {
                return "To Date must be greater than From Date.";
            }
            if (isFutureDate(data.fromDate) || isFutureDate(data.toDate)) {
                return "Dates cannot be in the future.";
            }
            if (!isDateWithinAcademicYear(data.fromDate, academicYearStr) || !isDateWithinAcademicYear(data.toDate, academicYearStr)) {
                return `Dates must fall within the selected Academic Year (${academicYearStr}).`;
            }
            if (data.courseHours === undefined || data.courseHours === null || data.courseHours === "") {
                return "Course Duration (Hours) is mandatory.";
            }
            if (isNaN(Number(data.courseHours)) || Number(data.courseHours) < 40) {
                return "Coursera Course must be at least 40 Hours.";
            }
            break;
        case 13:
            if (!data.grantType || !data.grantTitle || !data.fundingAgency || !data.grantAmount || !data.sanctionDate) {
                return "Grant Type, Title, Funding Agency, Grant Amount, and Sanction Date are mandatory.";
            }
            if (isFutureDate(data.sanctionDate)) {
                return "Sanction Date cannot be in the future.";
            }
            if (!isDateWithinAcademicYear(data.sanctionDate, academicYearStr)) {
                return `Sanction Date must fall within the selected Academic Year (${academicYearStr}).`;
            }
            break;
        default:
            return "Invalid Category selected.";
    }
    return null;
};;

// Helper to get the unique name/description field by Category for duplicate checks
const getContributionNameField = (category, data) => {
    const cat = parseInt(category);
    switch (cat) {
        case 1: return { field: 'organizationName', value: data.organizationName };
        case 2: return { field: 'journalName', value: data.journalName };
        case 3: return { field: 'journalName', value: data.journalName };
        case 4:
        case 5: return { field: 'awardName', value: data.awardName };
        case 6: return { field: 'courseName', value: data.courseName };
        case 7: return { field: 'certificationName', value: data.certificationName };
        case 8: return { field: 'eventName', value: data.eventName };
        case 9: return { field: 'articleTitle', value: data.articleTitle };
        case 10: return { field: 'facilityName', value: data.facilityName };
        case 11:
        case 12: return { field: 'courseName', value: data.courseName };
        case 13: return { field: 'grantName', value: data.grantName };
        default: return { field: '', value: '' };
    }
};

// @desc    Submit new faculty contribution entry (saves as Draft by default)
// @route   POST /api/value-addition/contribution
// @access  Private (Faculty)
exports.createContribution = async (req, res) => {
    try {
        const data = req.body;

        if (!data.academicYear || !data.category) {
            return res.status(400).json({ success: false, message: "Academic Year and Category are mandatory." });
        }

        // Validate proof upload
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Proof document upload is mandatory." });
        }

        // Validate file size (200KB limit)
        if (req.file.size > 200 * 1024) {
            return res.status(400).json({
                success: false,
                message: `Proof document is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 200KB.`
            });
        }

        const ayRecord = await AcademicYear.findById(data.academicYear);
        if (!ayRecord) {
            return res.status(400).json({ success: false, message: "Invalid Academic Year selected." });
        }
        const academicYearStr = ayRecord.year;

        const catDoc = await ContributionCategory.findById(data.category);
        if (!catDoc) {
            return res.status(400).json({ success: false, message: "Invalid Category selected." });
        }
        const categoryNum = catDoc.code;

        // Field validations per category
        const validationError = validateCategoryFields(categoryNum, data, academicYearStr);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        // Validate duplicates (same name/title in same category and academic year unless rejected)
        const { field, value } = getContributionNameField(categoryNum, data);
        if (field && value) {
            const query = {
                facultyId: req.user.userId,
                academicYear: data.academicYear,
                category: catDoc._id,
                [field]: { $regex: new RegExp("^" + value.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                status: { $ne: 'Rejected' },
                removedFromAppraisal: { $ne: true }
            };
            const existing = await Contribution.findOne(query);
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A duplicate entry for this academic year and category already exists with the same name: "${value}".`
                });
            }
        }

        // Cross-module NPTEL duplicate check
        if (categoryNum === 11) {
            const existingFdp = await ResourceUtilization.find({
                facultyId: req.user.userId,
                academicYear: data.academicYear,
                activityCategory: 'FDP',
                organizingInstitutionCategory: 'NPTEL',
                status: { $ne: 'Rejected' },
                removedFromAppraisal: { $ne: true }
            });

            const certNoInput = data.certificateNumber ? data.certificateNumber.trim().toLowerCase() : "";
            const courseNameInput = data.courseName ? data.courseName.trim().toLowerCase() : "";

            let conflictFound = false;
            for (const r of existingFdp) {
                const certNoExist = r.certificateNumber ? r.certificateNumber.trim().toLowerCase() : "";
                const courseNameExist = r.courseFdpName ? r.courseFdpName.trim().toLowerCase() : "";

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
                    message: "This NPTEL certificate is already claimed in Metric 3.1. A certificate can be considered only in one metric."
                });
            }
        }

        const contribution = new Contribution({
            facultyId: req.user.userId,
            academicYear: data.academicYear,
            category: catDoc._id,
            
            // Populate matching category fields
            organizationName: categoryNum === 1 ? data.organizationName : undefined,
            memberType: categoryNum === 1 ? data.memberType : undefined,
            fromDate: [1, 2, 3, 7, 10, 12, 13].includes(categoryNum) ? data.fromDate : undefined,
            toDate: [1, 2, 3, 7, 10, 12, 13].includes(categoryNum) ? data.toDate : undefined,
            
            journalName: [2, 3].includes(categoryNum) ? data.journalName : undefined,
            journalType: [2, 3].includes(categoryNum) ? data.journalType : undefined,
            
            duration: [1, 2, 3, 7, 10, 11, 12, 13].includes(categoryNum) ? data.duration : undefined,
            
            awardName: [4, 5].includes(categoryNum) ? data.awardName : undefined,
            awardingAgency: [4, 5].includes(categoryNum) ? data.awardingAgency : undefined,
            awardDate: [4, 5].includes(categoryNum) ? data.awardDate : undefined,
            
            courseName: [6, 11, 12].includes(categoryNum) ? data.courseName : undefined,
            url: categoryNum === 6 ? data.url : undefined,
            
            certificationName: categoryNum === 7 ? data.certificationName : undefined,
            
            eventName: categoryNum === 8 ? data.eventName : undefined,
            eventType: categoryNum === 8 ? data.eventType : undefined,
            studentNames: categoryNum === 8 ? data.studentNames : undefined,
            eventDate: categoryNum === 8 ? data.eventDate : undefined,
            
            articleTitle: categoryNum === 9 ? data.articleTitle : undefined,
            publicationName: categoryNum === 9 ? data.publicationName : undefined,
            publicationDate: categoryNum === 9 ? data.publicationDate : undefined,
            
            facilityName: categoryNum === 10 ? data.facilityName : undefined,
            contributionType: categoryNum === 10 ? data.contributionType : undefined,
            
            grantName: categoryNum === 13 ? data.grantName : undefined,
            grantType: categoryNum === 13 ? data.grantType : undefined,
            grantTitle: categoryNum === 13 ? data.grantTitle : undefined,
            fundingAgency: categoryNum === 13 ? data.fundingAgency : undefined,
            grantAmount: categoryNum === 13 ? Number(data.grantAmount) : undefined,
            sanctionDate: categoryNum === 13 ? data.sanctionDate : undefined,
            
            courseHours: (categoryNum === 12 || categoryNum === 7) ? Number(data.courseHours) : undefined,
            certificateNumber: data.certificateNumber || undefined,
            
            proof: `/uploads/contributions/${req.file.filename}`,
            status: 'Draft' // Always save as Draft first
        });

        await contribution.save();
        await syncAppraisalTotals(req.user.userId, data.academicYear);
        res.status(201).json({ success: true, data: contribution });
    } catch (err) {
        console.error("Create Contribution Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get own contributions (optional filtering by academicYear)
// @route   GET /api/value-addition/contribution
// @access  Private (Faculty)
exports.getMyContributions = async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        if (req.query.academicYear) {
            query.academicYear = req.query.academicYear;
        }

        const list = await Contribution.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .populate('category')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update contribution (only if status is Draft)
// @route   PUT /api/value-addition/contribution/:id
// @access  Private (Faculty)
exports.updateContribution = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const record = await Contribution.findById(id);
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

        const academicYearId = data.academicYear || record.academicYear;
        const ayRecord = await AcademicYear.findById(academicYearId);
        if (!ayRecord) {
            return res.status(400).json({ success: false, message: "Invalid Academic Year." });
        }
        const academicYearStr = ayRecord.year;

        // Validate fields for selected category
        const categoryVal = data.category || record.category;
        const catDoc = await ContributionCategory.findById(categoryVal);
        if (!catDoc) {
            return res.status(400).json({ success: false, message: "Invalid Category selected." });
        }
        const categoryNum = catDoc.code;

        const validationError = validateCategoryFields(categoryNum, { ...record.toObject(), ...data }, academicYearStr);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        // Validate duplicates (same name/title in same category and academic year unless rejected)
        const { field, value } = getContributionNameField(categoryNum, { ...record.toObject(), ...data });
        if (field && value) {
            const query = {
                _id: { $ne: id },
                facultyId: req.user.userId,
                academicYear: data.academicYear || record.academicYear,
                category: catDoc._id,
                [field]: { $regex: new RegExp("^" + value.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
                status: { $ne: 'Rejected' },
                removedFromAppraisal: { $ne: true }
            };
            const existing = await Contribution.findOne(query);
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A duplicate entry for this academic year and category already exists with the same name: "${value}".`
                });
            }
        }

        // Cross-module NPTEL duplicate check
        if (categoryNum === 11) {
            const existingFdp = await ResourceUtilization.find({
                facultyId: req.user.userId,
                academicYear: data.academicYear || record.academicYear,
                activityCategory: 'FDP',
                organizingInstitutionCategory: 'NPTEL',
                status: { $ne: 'Rejected' },
                removedFromAppraisal: { $ne: true }
            });

            const certNoInput = data.certificateNumber !== undefined ? data.certificateNumber : record.certificateNumber;
            const certNoInputNorm = certNoInput ? certNoInput.trim().toLowerCase() : "";
            
            const courseNameVal = data.courseName !== undefined ? data.courseName : record.courseName;
            const courseNameInput = courseNameVal ? courseNameVal.trim().toLowerCase() : "";

            const durationVal = data.duration !== undefined ? data.duration : record.duration;

            let conflictFound = false;
            for (const r of existingFdp) {
                const certNoExist = r.certificateNumber ? r.certificateNumber.trim().toLowerCase() : "";
                const courseNameExist = r.courseFdpName ? r.courseFdpName.trim().toLowerCase() : "";

                if (certNoInputNorm && certNoExist) {
                    if (certNoInputNorm === certNoExist) {
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
                    message: "This NPTEL certificate is already claimed in Metric 3.1. A certificate can be considered only in one metric."
                });
            }
        }

        // Update fields dynamically
        record.academicYear = data.academicYear || record.academicYear;
        record.category = catDoc._id;

        // Clear other fields to maintain schema purity
        record.organizationName = categoryNum === 1 ? (data.organizationName || record.organizationName) : undefined;
        record.memberType = categoryNum === 1 ? (data.memberType || record.memberType) : undefined;
        record.fromDate = [1, 2, 3, 7, 10, 12, 13].includes(categoryNum) ? (data.fromDate || record.fromDate) : undefined;
        record.toDate = [1, 2, 3, 7, 10, 12, 13].includes(categoryNum) ? (data.toDate || record.toDate) : undefined;
        
        record.journalName = [2, 3].includes(categoryNum) ? (data.journalName || record.journalName) : undefined;
        record.journalType = [2, 3].includes(categoryNum) ? (data.journalType || record.journalType) : undefined;
        // journalConferenceName is deprecated, just ensure it's undefined
        record.journalConferenceName = undefined;
        
        record.duration = [1, 2, 3, 7, 10, 11, 12, 13].includes(categoryNum) ? (data.duration || record.duration) : undefined;
        
        record.awardName = [4, 5].includes(categoryNum) ? (data.awardName || record.awardName) : undefined;
        record.awardingAgency = [4, 5].includes(categoryNum) ? (data.awardingAgency || record.awardingAgency) : undefined;
        record.awardDate = [4, 5].includes(categoryNum) ? (data.awardDate || record.awardDate) : undefined;
        
        record.courseName = [6, 11, 12].includes(categoryNum) ? (data.courseName || record.courseName) : undefined;
        record.url = categoryNum === 6 ? (data.url || record.url) : undefined;
        
        record.certificationName = categoryNum === 7 ? (data.certificationName || record.certificationName) : undefined;
        
        record.eventName = categoryNum === 8 ? (data.eventName || record.eventName) : undefined;
        record.eventType = categoryNum === 8 ? (data.eventType || record.eventType) : undefined;
        record.studentNames = categoryNum === 8 ? (data.studentNames || record.studentNames) : undefined;
        record.eventDate = categoryNum === 8 ? (data.eventDate || record.eventDate) : undefined;
        
        record.articleTitle = categoryNum === 9 ? (data.articleTitle || record.articleTitle) : undefined;
        record.publicationName = categoryNum === 9 ? (data.publicationName || record.publicationName) : undefined;
        record.publicationDate = categoryNum === 9 ? (data.publicationDate || record.publicationDate) : undefined;
        
        record.facilityName = categoryNum === 10 ? (data.facilityName || record.facilityName) : undefined;
        record.contributionType = categoryNum === 10 ? (data.contributionType || record.contributionType) : undefined;
        
        record.grantName = categoryNum === 13 ? (data.grantName || record.grantName) : undefined;
        record.grantType = categoryNum === 13 ? (data.grantType || record.grantType) : undefined;
        record.grantTitle = categoryNum === 13 ? (data.grantTitle || record.grantTitle) : undefined;
        record.fundingAgency = categoryNum === 13 ? (data.fundingAgency || record.fundingAgency) : undefined;
        record.grantAmount = categoryNum === 13 ? (data.grantAmount !== undefined ? Number(data.grantAmount) : record.grantAmount) : undefined;
        record.sanctionDate = categoryNum === 13 ? (data.sanctionDate || record.sanctionDate) : undefined;

        record.courseHours = (categoryNum === 12 || categoryNum === 7) ? (data.courseHours !== undefined ? Number(data.courseHours) : record.courseHours) : undefined;
        record.certificateNumber = data.certificateNumber !== undefined ? data.certificateNumber : record.certificateNumber;

        if (req.file) {
            if (req.file.size > 200 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: `Proof document is too large (${(req.file.size / 1024).toFixed(1)}KB). Maximum allowed size is 200KB.`
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
            record.proof = `/uploads/contributions/${req.file.filename}`;
        }

        // If the faculty edited a Rejected record, transition it back to Draft so it can be re-submitted.
        // HOD remarks (hodComment) are intentionally preserved for faculty reference.
        // This is the ONLY place where Rejected → Draft should ever happen.
        if (wasRejected) {
            record.status = 'Draft';
        }

        await record.save();
        await syncAppraisalTotals(req.user.userId, record.academicYear);
        res.json({ success: true, data: record });
    } catch (err) {
        console.error("Update Contribution Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Delete contribution (only if status is Draft)
// @route   DELETE /api/value-addition/contribution/:id
// @access  Private (Faculty)
exports.deleteContribution = async (req, res) => {
    try {
        const { id } = req.params;
        const record = await Contribution.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        if (record.facultyId.toString() !== req.user.userId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to delete this record." });
        }

        if (record.status === 'Rejected') {
            record.removedFromAppraisal = true;
            await record.save();
            await syncAppraisalTotals(req.user.userId, record.academicYear);
            return res.json({ success: true, message: "Record removed from appraisal." });
        } else if (record.status !== 'Draft') {
            return res.status(400).json({ success: false, message: "Only draft or rejected entries can be deleted/removed." });
        }

        await Contribution.findByIdAndDelete(id);
        await syncAppraisalTotals(req.user.userId, record.academicYear);
        res.json({ success: true, message: "Record deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Bulk submit all drafts of an academic year
// @route   POST /api/value-addition/contribution/submit-academic-year
// @access  Private (Faculty)
exports.submitAcademicYear = async (req, res) => {
    try {
        const { academicYear } = req.body;
        const query = { facultyId: req.user.userId, status: 'Draft' };
        if (academicYear) {
            query.academicYear = academicYear;
        }

        const result = await Contribution.updateMany(
            query,
            { status: 'Pending at HOD' }
        );

        res.json({
            success: true,
            message: `Successfully submitted ${result.modifiedCount} contributions for approval.`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get pending entries for HOD (exclude Drafts!)
// @route   GET /api/value-addition/contribution/pending-hod
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

        if (req.query.category && req.query.category !== 'All') {
            query.category = req.query.category;
        }

        const list = await Contribution.find(query)
            .populate('facultyId', 'name institutionId department coreDepartment profileImage')
            .populate('academicYear', 'year')
            .populate('category')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD action (Approve / Reject)
// @route   PUT /api/value-addition/contribution/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, isFinalApproval } = req.body;

        if (!action || !['Approve', 'Reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Please specify a valid action (Approve or Reject)." });
        }

        const record = await Contribution.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        if (action === 'Approve') {
            record.status = isFinalApproval ? 'Approved' : 'Approved by HOD';
        } else {
            record.status = 'Rejected';
        }
        record.hodComment = comment || "";

        await record.save();

        // Sync appraisal status if rejection
        if (action === 'Reject') {
            await syncAppraisalOnContributionRejection([id]);
        }

        res.json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD bulk action (Approve / Reject Selected)
// @route   POST /api/value-addition/contribution/hod-bulk-action
// @access  Private (HOD)
exports.bulkHODAction = async (req, res) => {
    try {
        const { ids, action, comment, isFinalApproval } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: "A list of entry IDs is required." });
        }
        if (!action || !['Approve', 'Reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Please specify a valid action (Approve or Reject)." });
        }

        let status;
        if (action === 'Approve') {
            status = isFinalApproval ? 'Approved' : 'Approved by HOD';
        } else {
            status = 'Rejected';
        }

        const updateData = { status, hodComment: comment || "" };

        await Contribution.updateMany(
            { _id: { $in: ids } },
            updateData
        );

        // Sync appraisal status if rejection
        if (action === 'Reject') {
            await syncAppraisalOnContributionRejection(ids);
        }

        res.json({
            success: true,
            message: `Successfully processed ${ids.length} entries as ${action === 'Approve' ? 'Approved' : 'Rejected'}.`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
