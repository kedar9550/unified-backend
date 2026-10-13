const Patent = require('./Patent.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureDate } = require('../../utils/validationHelper');

// @desc    Submit new patent publication
// @route   POST /api/research/patent
// @access  Private (Faculty)
exports.createPatent = async (req, res) => {
    try {
        const data = req.body;

        // 1. Mandatory Fields Validation
        if (!data.title || !data.patentName || !data.applyingSeedGrant || !data.applicationNo || !data.patentFiledCountry) {
            return res.status(400).json({ success: false, message: "Please fill all required fields." });
        }

        if (data.status === 'Published') {
            if (!data.dateOfFiling || !data.publisheddate) {
                return res.status(400).json({ success: false, message: "Date of Filing and Publication Date are required for Published patents." });
            }
        } else if (data.status === 'Granted') {
            if (!data.publisheddate || !data.granteddate) {
                return res.status(400).json({ success: false, message: "Publication Date and Grant Date are required for Granted patents." });
            }
        } else {
            if (!data.dateOfFiling) {
                return res.status(400).json({ success: false, message: "Date of Filing is required." });
            }
        }

        // Validation for documents
        if (!req.files || !req.files.cbr || !req.files.form1) {
            return res.status(400).json({ success: false, message: "All documents are mandatory." });
        }
        if (data.status === 'Granted' && (!req.files || !req.files.grantedCertificate)) {
            return res.status(400).json({ success: false, message: "Granted Certificate is mandatory for Granted patents." });
        }

        // Check file sizes individually (200KB limit as per guidelines)
        const filesToCheck = ['cbr', 'form1', 'grantedCertificate'];
        for (const field of filesToCheck) {
            if (req.files[field] && req.files[field][0].size > 200 * 1024) {
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return res.status(400).json({
                    success: false,
                    message: `${label} is too large (${(req.files[field][0].size / 1024).toFixed(1)}KB). Maximum allowed size is 200KB.`
                });
            }
        }

        const trimmedTitle = data.title.trim();
        const trimmedAppNo = (data.applicationNo || data.applicationnumber || '').trim();

        // 2. Duplicate Validation
        let existingRecord = null;
        if (trimmedAppNo) {
            existingRecord = await Patent.findOne({
                $or: [
                    { applicationNo: new RegExp(`^${escapeRegex(trimmedAppNo)}$`, 'i') },
                    { filingNo: new RegExp(`^${escapeRegex(trimmedAppNo)}$`, 'i') },
                    { title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i') }
                ]
            });
        } else {
            existingRecord = await Patent.findOne({
                title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i')
            });
        }

        if (existingRecord) {
            if (existingRecord.patentStatus === 'Published') {
                return res.status(400).json({
                    success: false,
                    isPublishedDuplicate: true,
                    existingPatentId: existingRecord._id,
                    message: "This patent has already been submitted under the 'Published' category. If your patent has now been granted, you can update its status from your existing patent records."
                });
            }

            if (existingRecord.patentStatus === 'Granted') {
                return res.status(400).json({
                    success: false,
                    message: "A patent entry with this title or application number is already registered and marked as 'Granted'."
                });
            }

            if (existingRecord.status === 'Rejected' || existingRecord.status === 'Rejected by R&D') {
                return res.status(400).json({
                    success: false,
                    message: "A patent entry with this title or application number already exists. If it was rejected, please use the Edit & Resubmit option instead of creating a new one."
                });
            }

            return res.status(400).json({
                success: false,
                message: "A patent entry with this title or application number already exists in the system."
            });
        }

        // 3. Date Validation (Not future)
        if (data.dateOfFiling && isFutureDate(data.dateOfFiling)) {
            return res.status(400).json({ success: false, message: "Date of Filing cannot be in the future." });
        }
        if (data.publisheddate && isFutureDate(data.publisheddate)) {
            return res.status(400).json({ success: false, message: "Publication Date cannot be in the future." });
        }
        if (data.granteddate && isFutureDate(data.granteddate)) {
            return res.status(400).json({ success: false, message: "Grant Date cannot be in the future." });
        }

        // Parse co-inventors
        let parsedCoInventors = [];
        if (typeof data.coInventors === 'string') {
            try {
                parsedCoInventors = JSON.parse(data.coInventors);
            } catch (e) {
                parsedCoInventors = [];
            }
        } else if (Array.isArray(data.coInventors)) {
            parsedCoInventors = data.coInventors;
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoInventors, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId, data.appraisalEligible || null);


        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantEmpId = applicant ? applicant.institutionId : null;
        let computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? applicantEmpId : null;

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
                return res.status(403).json({ success: false, message: "Only R&D Admin or Dean can use direct entry." });
            }

            const targetEmpId = data.targetFacultyEmpId;
            if (!targetEmpId) {
                return res.status(400).json({ success: false, message: "Target Faculty Employee ID is required for direct entry." });
            }

            const targetFaculty = await Employee.findOne({
                institutionId: new RegExp(`^${escapeRegex(targetEmpId.trim())}$`, 'i')
            });

            if (!targetFaculty) {
                return res.status(400).json({ success: false, message: `Target Faculty with ID ${targetEmpId} not found.` });
            }

            if (!targetFaculty.isActive) {
                return res.status(400).json({ success: false, message: `Faculty ${targetFaculty.name} (${targetFaculty.institutionId}) is inactive and cannot be selected.` });
            }

            finalFacultyId = targetFaculty._id;
            finalStatus = 'Approved';
            finalEntryType = 'Admin';
            computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? targetFaculty.institutionId : null;

            if (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') {
                if (!data.approvedAmount || Number(data.approvedAmount) <= 0) {
                    return res.status(400).json({ success: false, message: "Approved Incentive Amount is required when Apply Incentive is Yes." });
                }
            }

            if (!data.appraisalEligible) {
                return res.status(400).json({ success: false, message: "Appraisal Eligible status is required for direct entry." });
            }
        }

        let calculatedPubExpected = undefined;
        if (data.status === 'Published') {
            calculatedPubExpected = data.publishedexpectedamount ? Number(data.publishedexpectedamount) : 5000;
            if (data.applyingSeedGrant === 'Yes' || data.applyingSeedGrant === 'yes') calculatedPubExpected = calculatedPubExpected / 2;
            if (data.isUtilityType === 'No' || (data.applyIncentive !== 'Yes' && data.applyIncentive !== 'yes')) calculatedPubExpected = 0;
        }

        let calculatedGrantedExpected = undefined;
        if (data.status === 'Granted') {
            calculatedGrantedExpected = data.grantedexpectedamount ? Number(data.grantedexpectedamount) : 15000;
            if (data.applyingSeedGrant === 'Yes' || data.applyingSeedGrant === 'yes') calculatedGrantedExpected = calculatedGrantedExpected / 2;
            if (data.isUtilityType === 'No' || (data.applyIncentive !== 'Yes' && data.applyIncentive !== 'yes')) calculatedGrantedExpected = 0;
        }

        const patent = new Patent({
            ...data,
            title: trimmedTitle,
            facultyId: finalFacultyId,
            coInventors: resolvedAuthors,
            patentFiledInInstitution: data.patentFiledInInstitution || 'Yes',
            patentStatus: data.status, // Map 'status' from frontend to 'patentStatus' in model
            appraisalClaimant,
            status: finalStatus,
            incentiveClaimant: computedIncentiveClaimant,
            approvedAmount: (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? (data.approvedAmount ? Number(data.approvedAmount) : 0) : undefined,
            appraisalEligible: data.appraisalEligible || (data.isDirectEntry === 'true' ? 'Yes' : null),
            entryType: finalEntryType,
            published: {
                academicYear: data.status === 'Published' ? data.academicYear : (data.publishedAcademicYear || (data.publisheddate ? data.academicYear : undefined)),
                publishedstatus: data.publishedstatus || (data.status === 'Published' ? 'yes' : 'no'),
                publisheddate: data.publisheddate || undefined,
                publishedexpectedamount: calculatedPubExpected,
                publishedincentiveamount: (data.status === 'Published' && data.isDirectEntry === 'true' && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? (data.approvedAmount ? Number(data.approvedAmount) : 0) : undefined,
                publishedinsentiveappllieddate: (data.status === 'Published' && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? new Date() : undefined,
                applyIncentive: data.status === 'Published' ? (data.applyIncentive || 'No') : (data.published?.applyIncentive || 'No'),
                applyingSeedGrant: data.status === 'Published' ? (data.applyingSeedGrant || 'No') : (data.published?.applyingSeedGrant || 'No'),
                status: data.status === 'Published' ? finalStatus : undefined,
                hodComment: data.status === 'Published' ? '' : undefined,
                rndComment: data.status === 'Published' ? '' : undefined,
                appraisalClaimant: data.status === 'Published' ? appraisalClaimant : null,
                appraisalEligible: data.status === 'Published' ? (data.appraisalEligible || (data.isDirectEntry === 'true' ? 'Yes' : null)) : null
            },
            granted: {
                academicYear: data.status === 'Granted' ? data.academicYear : (data.grantedAcademicYear || undefined),
                grantedstatus: data.grantedstatus || (data.status === 'Granted' ? 'yes' : 'no'),
                granteddate: data.granteddate || undefined,
                grantedexpectedamount: calculatedGrantedExpected,
                grantedincentiveamount: (data.status === 'Granted' && data.isDirectEntry === 'true' && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? (data.approvedAmount ? Number(data.approvedAmount) : 0) : undefined,
                grantedinsentiveappllieddate: (data.status === 'Granted' && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? new Date() : undefined,
                applyIncentive: data.status === 'Granted' ? (data.applyIncentive || 'No') : undefined,
                applyingSeedGrant: data.status === 'Granted' ? (data.applyingSeedGrant || 'No') : undefined,
                status: data.status === 'Granted' ? finalStatus : undefined,
                hodComment: data.status === 'Granted' ? '' : undefined,
                rndComment: data.status === 'Granted' ? '' : undefined,
                appraisalClaimant: data.status === 'Granted' ? appraisalClaimant : null,
                appraisalEligible: data.status === 'Granted' ? (data.appraisalEligible || (data.isDirectEntry === 'true' ? 'Yes' : null)) : null
            }
        });

        if (req.files) {
            if (req.files.cbr) patent.cbr = `/uploads/patents/${req.files.cbr[0].filename}`;
            if (req.files.form1) patent.form1 = `/uploads/patents/${req.files.form1[0].filename}`;
            if (req.files.grantedCertificate) patent.grantedCertificate = `/uploads/patents/${req.files.grantedCertificate[0].filename}`;
        }

        await patent.save();

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
                        message: `${emp.name || 'A faculty member'} has submitted a new Patent: ${patent.title}`,
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
                    title: 'Patent Added',
                    message: `R&D has directly added an approved Patent for you: ${patent.title}`,
                    link: `/research/patent-publication`
                });
            }
        } catch (notifErr) {
            console.error("Failed to send patent notification:", notifErr);
        }
        res.status(201).json({ success: true, data: patent });
    } catch (err) {
        console.error("Create Patent Error:", err);
        if (err.code === 11000) {
            const field = Object.keys(err.keyValue || {})[0];
            const value = err.keyValue ? err.keyValue[field] : '';
            try {
                const dupDoc = await Patent.findOne({ [field]: value });
                if (dupDoc && dupDoc.patentStatus === 'Published') {
                    return res.status(400).json({
                        success: false,
                        isPublishedDuplicate: true,
                        existingPatentId: dupDoc._id,
                        message: "This patent has already been submitted under the 'Published' category. If your patent has now been granted, you can update its status from your existing patent records."
                    });
                }
            } catch (e) {}
            const message = `Duplicate entry: A patent with ${field} '${value}' already exists.`;
            return res.status(400).json({ success: false, message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update and resubmit an existing rejected patent
// @route   PUT /api/research/patent/:id
// @access  Private (Faculty)
exports.updatePatent = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const patent = await Patent.findById(id);
        if (!patent) {
            return res.status(404).json({ success: false, message: "Patent not found." });
        }

        // Verify ownership
        if (patent.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Not authorized to edit this patent." });
        }

        if (!patent.status.includes('Rejected')) {
            return res.status(400).json({ success: false, message: "Only rejected patents can be edited and resubmitted." });
        }

        // Validate file sizes (200KB limit)
        const filesToCheck = ['cbr', 'form1', 'grantedCertificate'];
        if (req.files) {
            for (const field of filesToCheck) {
                if (req.files[field] && req.files[field][0].size > 200 * 1024) {
                    const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    return res.status(400).json({
                        success: false,
                        message: `${label} is too large. Maximum allowed size is 200KB.`
                    });
                }
            }
        }

        // If patent was previously published and updated to Granted, allow editing ONLY grant update details
        const isStatusUpdatedToGranted = Boolean(
            patent.statusUpdatedToGranted || 
            (patent.patentStatus === 'Granted' && (patent.published?.publishedstatus === 'yes' || patent.published?.publisheddate))
        );

        if (isStatusUpdatedToGranted) {
            const gDate = data.granteddate || data.dateOfGranted || patent.granted?.granteddate;
            if (!gDate) {
                return res.status(400).json({ success: false, message: "Granted date is required." });
            }
            if (isFutureDate(gDate)) {
                return res.status(400).json({ success: false, message: "Grant Date cannot be in the future." });
            }

            const fs = require('fs');
            const path = require('path');
            const deleteOldFile = (oldPath) => {
                if (oldPath) {
                    try {
                        const cleanPath = oldPath.replace(/^\//, '');
                        const fullPath = path.join(__dirname, '../..', cleanPath);
                        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                    } catch (e) { }
                }
            };

            let grantedCertificatePath = patent.grantedCertificate;
            if (req.files && req.files.grantedCertificate) {
                deleteOldFile(patent.grantedCertificate);
                grantedCertificatePath = `/uploads/patents/${req.files.grantedCertificate[0].filename}`;
            } else if (data.deleteGrantedCertificate === 'true' && (!req.files || !req.files.grantedCertificate)) {
                return res.status(400).json({ success: false, message: "Granted certificate is required." });
            }

            if (!grantedCertificatePath) {
                return res.status(400).json({ success: false, message: "Granted certificate is required." });
            }

            const grantedApplyIncentive = data.applyIncentive !== undefined ? data.applyIncentive : (patent.granted?.applyIncentive || patent.applyIncentive || 'No');
            const grantedApplyingSeedGrant = data.applyingSeedGrant !== undefined ? data.applyingSeedGrant : (patent.granted?.applyingSeedGrant || patent.applyingSeedGrant || 'No');

            let expectedAmt = 15000;
            if (patent.isUtilityType === 'No') expectedAmt = 0;
            else if (grantedApplyingSeedGrant === 'Yes' || grantedApplyingSeedGrant === 'yes') expectedAmt = 7500;
            if (grantedApplyIncentive !== 'Yes' && grantedApplyIncentive !== 'yes') expectedAmt = 0;

            const applicant = await Employee.findById(req.user.userId).select('institutionId');
            const applicantEmpId = applicant ? applicant.institutionId : null;
            const computedIncentiveClaimant = (grantedApplyIncentive === 'Yes' || grantedApplyIncentive === 'yes') ? applicantEmpId : null;

            const publishedAcademicYear = patent.published?.academicYear || patent.academicYear;
            const grantedAcademicYear = patent.granted?.academicYear || data.academicYear || patent.academicYear;

            const ausCoInventors = (patent.coInventors || []).filter(c => c.employeeId || (c.affiliation && c.affiliation.toLowerCase().includes('aditya')));
            const hasOtherAusAuthors = ausCoInventors.length > 0;
            const grantedClaimant = hasOtherAusAuthors ? null : applicantEmpId;

            const publishedInfo = {
                ...(patent.published && typeof patent.published.toObject === 'function' ? patent.published.toObject() : (patent.published || {})),
                academicYear: publishedAcademicYear,
                applyIncentive: patent.published?.applyIncentive || patent.applyIncentive || 'No',
                applyingSeedGrant: patent.published?.applyingSeedGrant || patent.applyingSeedGrant || 'No',
                appraisalClaimant: patent.published?.appraisalClaimant || null,
                appraisalEligible: patent.published?.appraisalEligible || 'Yes'
            };

            const grantedInfo = {
                ...(patent.granted && typeof patent.granted.toObject === 'function' ? patent.granted.toObject() : (patent.granted || {})),
                academicYear: grantedAcademicYear,
                grantedstatus: 'yes',
                granteddate: gDate,
                applyIncentive: grantedApplyIncentive,
                applyingSeedGrant: grantedApplyingSeedGrant,
                grantedexpectedamount: expectedAmt,
                grantedinsentiveappllieddate: (grantedApplyIncentive === 'Yes' || grantedApplyIncentive === 'yes') ? (patent.granted?.grantedinsentiveappllieddate || new Date()) : undefined,
                appraisalClaimant: grantedClaimant,
                appraisalEligible: null
            };

            patent.published = publishedInfo;
            patent.granted = grantedInfo;
            patent.appraisalClaimant = grantedClaimant;
            patent.grantedCertificate = grantedCertificatePath;
            patent.eligibleForTechTransfer = data.eligibleForTechTransfer || patent.eligibleForTechTransfer || 'No';
            patent.applyIncentive = grantedApplyIncentive;
            patent.applyingSeedGrant = grantedApplyingSeedGrant;
            patent.incentiveClaimant = computedIncentiveClaimant;
            patent.patentStatus = 'Granted';
            patent.statusUpdatedToGranted = true;

            // Reset approval status for resubmission
            patent.status = 'Pending';
            patent.hodComment = '';
            patent.rndComment = '';
            patent.approvedAmount = null;
            patent.appraisalEligible = null;

            await patent.save();

            // Send notification to boss
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
                            title: 'Research Resubmission',
                            message: `${emp.name || 'A faculty member'} has resubmitted Patent: ${patent.title}`,
                            link: `/hod/research-approvals`,
                        });
                    }
                }
            } catch (notifErr) {
                console.error("Failed to send patent resubmit notification:", notifErr);
            }

            return res.json({ success: true, data: patent });
        }

        // Validate Title and Application No for duplicates
        const checkTitle = data.title ? data.title.trim() : null;
        const checkAppNo = (data.applicationNo || data.applicationnumber) ? (data.applicationNo || data.applicationnumber).trim() : null;

        const orClauses = [];
        if (checkTitle) orClauses.push({ title: new RegExp(`^${escapeRegex(checkTitle)}$`, 'i') });
        if (checkAppNo) {
            orClauses.push({ applicationNo: new RegExp(`^${escapeRegex(checkAppNo)}$`, 'i') });
            orClauses.push({ filingNo: new RegExp(`^${escapeRegex(checkAppNo)}$`, 'i') });
        }

        if (orClauses.length > 0) {
            const existingRecord = await Patent.findOne({
                _id: { $ne: id },
                $or: orClauses
            });

            if (existingRecord) {
                if (existingRecord.patentStatus === 'Published') {
                    return res.status(400).json({
                        success: false,
                        isPublishedDuplicate: true,
                        existingPatentId: existingRecord._id,
                        message: "This patent has already been submitted under the 'Published' category. If your patent has now been granted, you can update its status from your existing patent records."
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: "A patent entry with this title or application number already exists."
                });
            }
        }

        const currentStatus = data.status || patent.patentStatus;
        const currentFilingDate = data.dateOfFiling !== undefined ? data.dateOfFiling : patent.dateOfFiling;
        const currentPublishedDate = (data.publisheddate || data.dateOfPublished) !== undefined
            ? (data.publisheddate || data.dateOfPublished)
            : (patent.published?.publisheddate || patent.dateOfPublished);
        const currentGrantedDate = (data.granteddate || data.dateOfGranted) !== undefined
            ? (data.granteddate || data.dateOfGranted)
            : (patent.granted?.granteddate || patent.dateOfGranted);

        if (currentStatus === 'Published') {
            if (!currentFilingDate || !currentPublishedDate) {
                return res.status(400).json({ success: false, message: "Date of Filing and Publication Date are required for Published patents." });
            }
        } else if (currentStatus === 'Granted') {
            if (!currentPublishedDate || !currentGrantedDate) {
                return res.status(400).json({ success: false, message: "Publication Date and Grant Date are required for Granted patents." });
            }
        } else {
            if (!currentFilingDate) {
                return res.status(400).json({ success: false, message: "Date of Filing is required." });
            }
        }

        // Date Validation
        if (currentFilingDate && isFutureDate(currentFilingDate)) {
            return res.status(400).json({ success: false, message: "Date of Filing cannot be in the future." });
        }
        if (currentPublishedDate && isFutureDate(currentPublishedDate)) {
            return res.status(400).json({ success: false, message: "Publication Date cannot be in the future." });
        }
        if (currentGrantedDate && isFutureDate(currentGrantedDate)) {
            return res.status(400).json({ success: false, message: "Grant Date cannot be in the future." });
        }

        // Parse co-inventors
        let parsedCoInventors = patent.coInventors;
        if (data.coInventors) {
            if (typeof data.coInventors === 'string') {
                try {
                    parsedCoInventors = JSON.parse(data.coInventors);
                } catch (e) {
                    parsedCoInventors = [];
                }
            } else if (Array.isArray(data.coInventors)) {
                parsedCoInventors = data.coInventors;
            }
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoInventors, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId, data.appraisalEligible || null);

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applyIncentive = data.applyIncentive !== undefined ? data.applyIncentive : patent.applyIncentive;
        const computedIncentiveClaimant = (applyIncentive === 'Yes' || applyIncentive === 'yes') ? applicant.institutionId : null;

        // Update fields
        Object.keys(data).forEach(key => {
            if (key !== 'coInventors' && key !== 'status' && key !== 'facultyId' && 
                !key.startsWith('published') && !key.startsWith('granted') && 
                data[key] !== undefined) {
                // patent.status stores the approval state, but frontend form has a 'status' field mapping to 'patentStatus'
                patent[key] = data[key];
            }
        });
        
        if (data.status) patent.patentStatus = data.status;

        const isPublishedNow = currentStatus === 'Published';
        const isGrantedNow = currentStatus === 'Granted';

        patent.published = {
            academicYear: isPublishedNow ? (data.academicYear || patent.published?.academicYear || patent.academicYear) : (patent.published?.academicYear || patent.academicYear),
            publishedstatus: data.publishedstatus || patent.published?.publishedstatus || 'no',
            publishedexpectedamount: data.publishedexpectedamount ? Number(data.publishedexpectedamount) : (isPublishedNow ? 5000 : patent.published?.publishedexpectedamount),
            publishedincentiveamount: isPublishedNow ? null : patent.published?.publishedincentiveamount,
            publisheddate: data.publisheddate || patent.published?.publisheddate,
            publishedinsentiveappllieddate: (isPublishedNow && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? new Date() : patent.published?.publishedinsentiveappllieddate,
            applyIncentive: isPublishedNow ? (data.applyIncentive || 'No') : (patent.published?.applyIncentive || data.applyIncentive || 'No'),
            applyingSeedGrant: isPublishedNow ? (data.applyingSeedGrant || 'No') : (patent.published?.applyingSeedGrant || data.applyingSeedGrant || 'No'),
            status: isPublishedNow ? 'Pending' : (patent.published?.status || 'Approved'),
            hodComment: isPublishedNow ? '' : patent.published?.hodComment,
            rndComment: isPublishedNow ? '' : patent.published?.rndComment,
            appraisalClaimant: isPublishedNow ? appraisalClaimant : (patent.published?.appraisalClaimant || null),
            appraisalEligible: isPublishedNow ? (data.appraisalEligible || null) : (patent.published?.appraisalEligible || null)
        };

        patent.granted = {
            academicYear: isGrantedNow ? (data.academicYear || patent.granted?.academicYear || patent.academicYear) : (patent.granted?.academicYear || patent.academicYear),
            grantedstatus: data.grantedstatus || patent.granted?.grantedstatus || 'no',
            grantedexpectedamount: data.grantedexpectedamount ? Number(data.grantedexpectedamount) : (isGrantedNow ? 15000 : patent.granted?.grantedexpectedamount),
            grantedincentiveamount: isGrantedNow ? null : patent.granted?.grantedincentiveamount,
            granteddate: data.granteddate || patent.granted?.granteddate,
            grantedinsentiveappllieddate: (isGrantedNow && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? new Date() : patent.granted?.grantedinsentiveappllieddate,
            applyIncentive: isGrantedNow ? (data.applyIncentive || 'No') : (patent.granted?.applyIncentive || data.applyIncentive || 'No'),
            applyingSeedGrant: isGrantedNow ? (data.applyingSeedGrant || 'No') : (patent.granted?.applyingSeedGrant || data.applyingSeedGrant || 'No'),
            status: isGrantedNow ? 'Pending' : patent.granted?.status,
            hodComment: isGrantedNow ? '' : patent.granted?.hodComment,
            rndComment: isGrantedNow ? '' : patent.granted?.rndComment,
            appraisalClaimant: isGrantedNow ? appraisalClaimant : (patent.granted?.appraisalClaimant || null),
            appraisalEligible: isGrantedNow ? (data.appraisalEligible || null) : (patent.granted?.appraisalEligible || null)
        };

        patent.title = data.title ? data.title.trim() : patent.title;
        patent.facultyRole = data.facultyRole || patent.facultyRole;
        patent.applicantName = data.applicantName || patent.applicantName;
        patent.applicantAffiliation = data.applicantAffiliation || patent.applicantAffiliation;
        patent.coInventors = resolvedAuthors;
        patent.appraisalClaimant = appraisalClaimant;
        patent.incentiveClaimant = computedIncentiveClaimant;
        patent.status = 'Pending'; // Resubmit
        patent.hodComment = '';
        patent.rndComment = '';
        patent.approvedAmount = null;
        patent.appraisalEligible = null;

        const fs = require('fs');
        const path = require('path');
        const deleteOldFile = (oldPath) => {
            if (oldPath) {
                try {
                    const cleanPath = oldPath.replace(/^\//, ''); // Remove leading slash
                    const fullPath = path.join(__dirname, '../..', cleanPath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                } catch (e) { }
            }
        };

        if (req.files) {
            if (req.files.cbr) {
                deleteOldFile(patent.cbr);
                patent.cbr = `/uploads/patents/${req.files.cbr[0].filename}`;
            }
            if (req.files.form1) {
                deleteOldFile(patent.form1);
                patent.form1 = `/uploads/patents/${req.files.form1[0].filename}`;
            }
            if (req.files.grantedCertificate) {
                deleteOldFile(patent.grantedCertificate);
                patent.grantedCertificate = `/uploads/patents/${req.files.grantedCertificate[0].filename}`;
            }
        }

        if (data.deleteCbr === 'true' && (!req.files || !req.files.cbr)) {
            deleteOldFile(patent.cbr);
            patent.cbr = null;
        }
        if (data.deleteForm1 === 'true' && (!req.files || !req.files.form1)) {
            deleteOldFile(patent.form1);
            patent.form1 = null;
        }
        if (data.deleteGrantedCertificate === 'true' && (!req.files || !req.files.grantedCertificate)) {
            deleteOldFile(patent.grantedCertificate);
            patent.grantedCertificate = null;
        }

        await patent.save();

        res.json({ success: true, data: patent });
    } catch (err) {
        console.error("Update Patent Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update patent status to Granted
// @route   PATCH /api/research/patent/:id/update-status
// @access  Private (Faculty)
exports.updatePatentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const patent = await Patent.findById(id);
        if (!patent) {
            return res.status(404).json({ success: false, message: "Patent not found." });
        }

        if (patent.facultyId.toString() !== req.user.userId && data.isDirectEntry !== 'true') {
            return res.status(403).json({ success: false, message: "Not authorized." });
        }

        if (patent.patentStatus === 'Granted') {
            return res.status(400).json({ success: false, message: "Patent is already granted." });
        }

        if (!data.granteddate) {
            return res.status(400).json({ success: false, message: "Granted date is required." });
        }

        if (!req.files || !req.files.grantedCertificate) {
            return res.status(400).json({ success: false, message: "Granted certificate is required." });
        }

        if (req.files.grantedCertificate[0].size > 200 * 1024) {
            return res.status(400).json({ success: false, message: "Granted certificate is too large. Maximum allowed size is 200KB." });
        }

        const grantedApplyIncentive = data.applyIncentive || 'No';
        const grantedApplyingSeedGrant = data.applyingSeedGrant || 'No';

        let expectedAmt = 15000;
        if (patent.isUtilityType === 'No') expectedAmt = 0;
        else if (grantedApplyingSeedGrant === 'Yes' || grantedApplyingSeedGrant === 'yes') expectedAmt = 7500;
        if (grantedApplyIncentive !== 'Yes' && grantedApplyIncentive !== 'yes') expectedAmt = 0;

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantEmpId = applicant ? applicant.institutionId : null;
        const computedIncentiveClaimant = (grantedApplyIncentive === 'Yes' || grantedApplyIncentive === 'yes') ? applicantEmpId : null;

        let grantAcademicYear = data.academicYear;
        if (!grantAcademicYear) {
            const AcademicYear = require('../academicYear/academicYear.model');
            const activeYear = await AcademicYear.findOne({ active: true });
            grantAcademicYear = activeYear ? activeYear._id : patent.academicYear;
        }

        const publishedAcademicYear = patent.published?.academicYear || patent.academicYear;

        const publishedInfo = {
            ...(patent.published && typeof patent.published.toObject === 'function' ? patent.published.toObject() : (patent.published || {})),
            academicYear: publishedAcademicYear,
            publishedincentiveamount: patent.published?.publishedincentiveamount !== undefined ? patent.published.publishedincentiveamount : (patent.approvedAmount || undefined),
            status: patent.published?.status || patent.status || 'Approved',
            hodComment: patent.published?.hodComment !== undefined ? patent.published.hodComment : (patent.hodComment || ''),
            rndComment: patent.published?.rndComment !== undefined ? patent.published.rndComment : (patent.rndComment || ''),
            applyIncentive: patent.published?.applyIncentive || patent.applyIncentive || 'No',
            applyingSeedGrant: patent.published?.applyingSeedGrant || patent.applyingSeedGrant || 'No',
            appraisalClaimant: patent.published?.appraisalClaimant || patent.appraisalClaimant || null,
            appraisalEligible: patent.published?.appraisalEligible || patent.appraisalEligible || null
        };

        const ausCoInventors = (patent.coInventors || []).filter(c => c.employeeId || (c.affiliation && c.affiliation.toLowerCase().includes('aditya')));
        const hasOtherAusAuthors = ausCoInventors.length > 0;
        const grantedClaimant = hasOtherAusAuthors ? null : applicantEmpId;

        const statusUpdateTimestamp = new Date();
        const grantedInfo = {
            ...(patent.granted && typeof patent.granted.toObject === 'function' ? patent.granted.toObject() : (patent.granted || {})),
            academicYear: grantAcademicYear,
            grantedstatus: 'yes',
            granteddate: data.granteddate,
            status: 'Pending',
            hodComment: '',
            rndComment: '',
            grantedincentiveamount: undefined,
            applyIncentive: grantedApplyIncentive,
            applyingSeedGrant: grantedApplyingSeedGrant,
            grantedexpectedamount: expectedAmt,
            submittedDate: statusUpdateTimestamp,
            grantedinsentiveappllieddate: (grantedApplyIncentive === 'Yes' || grantedApplyIncentive === 'yes') ? statusUpdateTimestamp : undefined,
            appraisalClaimant: grantedClaimant,
            appraisalEligible: null
        };

        const fs = require('fs');
        const path = require('path');
        if (patent.grantedCertificate) {
            try {
                const cleanPath = patent.grantedCertificate.replace(/^\//, '');
                const fullPath = path.join(__dirname, '../..', cleanPath);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch (e) {}
        }
        const grantedCertificatePath = `/uploads/patents/${req.files.grantedCertificate[0].filename}`;

        const updatedPatent = await Patent.findByIdAndUpdate(id, {
            $set: {
                patentStatus: 'Granted',
                status: 'Pending',
                statusUpdatedToGranted: true,
                statusUpdatedDate: statusUpdateTimestamp,
                academicYear: grantAcademicYear,
                hodComment: '',
                rndComment: '',
                appraisalEligible: null,
                appraisalClaimant: grantedClaimant,
                eligibleForTechTransfer: data.eligibleForTechTransfer || 'No',
                applyIncentive: grantedApplyIncentive,
                applyingSeedGrant: grantedApplyingSeedGrant,
                incentiveClaimant: computedIncentiveClaimant,
                published: publishedInfo,
                granted: grantedInfo,
                grantedCertificate: grantedCertificatePath
            },
            $unset: {
                approvedAmount: 1
            }
        }, { new: true })
        .populate('facultyId', 'name employeeId college')
        .populate('academicYear', 'year')
        .populate('published.academicYear', 'year')
        .populate('granted.academicYear', 'year');

        res.json({ success: true, data: updatedPatent });
    } catch (err) {
        console.error("Update Patent Status Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own patents and patents where they are a co-inventor
// @route   GET /api/research/patent
// @access  Private (Faculty)
exports.getMyPatents = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);

        const query = {
            $or: [
                { facultyId: req.user.userId },
                { 'coInventors.employeeId': user ? user.institutionId : null },
                ...(user && user.name ? [{ 'coInventors.name': new RegExp(`^${escapeRegex(user.name.trim())}$`, 'i') }] : [])
            ]
        };

        const patents = await Patent.find(query)
            .populate('academicYear', 'year')
            .populate('published.academicYear', 'year')
            .populate('granted.academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });

        const patentsWithVisibility = patents.map(p => {
            const pObj = p.toObject();
            if (p.facultyId && p.facultyId._id.toString() !== req.user.userId.toString()) {
                pObj.visibilityRole = "Co-Inventor";
            } else {
                pObj.visibilityRole = "Applicant";
            }
            return pObj;
        });

        res.json({ success: true, data: patentsWithVisibility });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get patent by ID
// @route   GET /api/research/patent/:id
// @access  Private
exports.getPatentById = async (req, res) => {
    try {
        const patent = await Patent.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year')
            .populate('published.academicYear', 'year')
            .populate('granted.academicYear', 'year')
            .populate('coInventors.employeeId', 'name institutionId');

        if (!patent) {
            return res.status(404).json({ success: false, message: 'Patent not found' });
        }
        res.json({ success: true, data: patent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Get patents pending at HOD
// @route   GET /api/research/patent/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        const Employee = require('../employee/employee.model');
        const deptIds = await getHODDepartments(req.user);

        const facultyIds = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ]
        }).distinct('_id');

        const patents = await Patent.find({
            facultyId: { $in: facultyIds },
            status: 'Pending'
        })
        .populate('facultyId', 'name institutionId department')
        .populate('academicYear', 'year')
        .populate('published.academicYear', 'year')
        .populate('granted.academicYear', 'year');

        res.json({ success: true, data: patents });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/patent/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected';
        const patent = await Patent.findById(id);
        if (!patent) {
            return res.status(404).json({ success: false, message: 'Patent not found' });
        }

        patent.status = status;
        patent.hodComment = comment;

        if (patent.patentStatus === 'Published') {
            if (!patent.published) patent.published = {};
            patent.published.status = status;
            patent.published.hodComment = comment;
        } else if (patent.patentStatus === 'Granted') {
            if (!patent.granted) patent.granted = {};
            patent.granted.status = status;
            patent.granted.hodComment = comment;
        }

        await patent.save();

        
        try {
            const NotificationService = require('../../modules/notification/notification.service');
            const { getApproverRoleTitle } = require('../hierarchy/reportingBoss.helper');
            const targetFacultyId = patent.facultyId || patent.facultyId?._id;
            const approverRole = await getApproverRoleTitle(req, targetFacultyId);
            
            if (targetFacultyId) {
                await NotificationService.sendNotification({
                    recipientId: targetFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: action === 'Approve' ? 'SUCCESS' : 'ERROR',
                    title: `Patent ${action}d by ${approverRole}`,
                    message: `Your Patent has been ${action.toLowerCase()}d by ${approverRole}.`,
                    link: '/research/patent-publication'
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
                        title: `New Patent for R&D Approval`,
                        message: `A Patent application has been approved by ${approverRole} and is pending your approval.`,
                        link: '/research-dean/approvals'
                    });
                }
            }
        } catch (notifErr) {
            console.error("Failed to send notification:", notifErr);
        }

        res.json({ success: true, data: patent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get patents pending at R&D
// @route   GET /api/research/patent/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const patents = await Patent.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year')
            .populate('published.academicYear', 'year')
            .populate('granted.academicYear', 'year');
        res.json({ success: true, data: patents });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/patent/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, approvedAmount } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const patent = await Patent.findById(id);
        if (!patent) {
            return res.status(404).json({ success: false, message: 'Patent not found' });
        }

        if (action === 'Approve') {
            if (!req.body.appraisalEligible) {
                return res.status(400).json({ success: false, message: 'Appraisal Eligible status is required for approval.' });
            }
            if (patent.applyIncentive === 'Yes' || patent.applyIncentive === 'yes') {
                if (approvedAmount === undefined || approvedAmount === null || approvedAmount === '' || Number(approvedAmount) <= 0) {
                    return res.status(400).json({ success: false, message: 'Approved Incentive Amount is required when Apply Incentive is Yes.' });
                }
            }
        }

        patent.status = status;
        patent.rndComment = comment;
        if (action === 'Approve' && approvedAmount !== undefined) {
            patent.approvedAmount = approvedAmount;
        }

        if (patent.patentStatus === 'Published') {
            if (!patent.published) patent.published = {};
            patent.published.status = status;
            patent.published.rndComment = comment;
            if (action === 'Approve') {
                if (approvedAmount !== undefined) {
                    patent.published.publishedincentiveamount = approvedAmount;
                }
                if (req.body.appraisalEligible) {
                    patent.published.appraisalEligible = req.body.appraisalEligible;
                }
            }
        } else if (patent.patentStatus === 'Granted') {
            if (!patent.granted) patent.granted = {};
            patent.granted.status = status;
            patent.granted.rndComment = comment;
            if (action === 'Approve') {
                if (approvedAmount !== undefined) {
                    patent.granted.grantedincentiveamount = approvedAmount;
                }
                if (req.body.appraisalEligible) {
                    patent.granted.appraisalEligible = req.body.appraisalEligible;
                }
            }
        }
        if (action === 'Approve' && req.body.appraisalEligible && ['Yes', 'No'].includes(req.body.appraisalEligible)) {
            patent.appraisalEligible = req.body.appraisalEligible;
        }

        // Scenario 2: If appraisalEligible = 'No', clear any previously auto-assigned claimant
        if (status === 'Approved' && req.body.appraisalEligible === 'No') {
            patent.appraisalClaimant = null;
            if (patent.patentStatus === 'Published' && patent.published) patent.published.appraisalClaimant = null;
            if (patent.patentStatus === 'Granted' && patent.granted) patent.granted.appraisalClaimant = null;
        }

        // If approved and appraisalEligible = 'Yes'
        if (status === 'Approved' && req.body.appraisalEligible === 'Yes') {
            const ausCoInventors = (patent.coInventors || []).filter(c => c.employeeId || (c.affiliation && c.affiliation.toLowerCase().includes('aditya')));
            const hasOtherAusAuthors = ausCoInventors.length > 0;

            if (patent.patentStatus === 'Granted') {
                if (hasOtherAusAuthors) {
                    // Coinventors exist: reset granted appraisalClaimant and root appraisalClaimant to null
                    // so applicant can select appraisal claimant after granted status got approved!
                    if (!patent.granted) patent.granted = {};
                    patent.granted.appraisalClaimant = null;
                    patent.appraisalClaimant = null;
                } else {
                    const applicantEmp = await Employee.findById(patent.facultyId).select('institutionId');
                    if (applicantEmp && applicantEmp.institutionId) {
                        if (!patent.granted) patent.granted = {};
                        patent.granted.appraisalClaimant = applicantEmp.institutionId;
                        patent.appraisalClaimant = applicantEmp.institutionId;
                    }
                }
            } else if (patent.patentStatus === 'Published') {
                if (hasOtherAusAuthors) {
                    if (!patent.published?.appraisalClaimant) {
                        if (!patent.published) patent.published = {};
                        patent.published.appraisalClaimant = null;
                        patent.appraisalClaimant = null;
                    }
                } else {
                    const applicantEmp = await Employee.findById(patent.facultyId).select('institutionId');
                    if (applicantEmp && applicantEmp.institutionId) {
                        if (!patent.published) patent.published = {};
                        patent.published.appraisalClaimant = applicantEmp.institutionId;
                        patent.appraisalClaimant = applicantEmp.institutionId;
                    }
                }
            }
        }

        if (status === 'Approved' && (patent.applyIncentive === 'Yes' || patent.applyIncentive === 'yes')) {
            const applicantEmp = await Employee.findById(patent.facultyId).select('institutionId');
            if (applicantEmp && applicantEmp.institutionId) {
                patent.incentiveClaimant = applicantEmp.institutionId;
            }
        }

        await patent.save();
        
        try {
            const NotificationService = require('../../modules/notification/notification.service');
            const targetFacultyId = patent.facultyId || patent.facultyId?._id;
            
            if (targetFacultyId) {
                await NotificationService.sendNotification({
                    recipientId: targetFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: action === 'Approve' ? 'SUCCESS' : 'ERROR',
                    title: `Patent ${action}d by R&D`,
                    message: `Your Patent has been ${action.toLowerCase()}d by R&D.`,
                    link: '/research/patent-publication'
                });
            }
        } catch (notifErr) {
            console.error("Failed to send notification:", notifErr);
        }

        res.json({ success: true, data: patent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
