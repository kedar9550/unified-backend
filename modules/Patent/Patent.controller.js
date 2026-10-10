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

        // Check file sizes individually (500KB limit)
        const filesToCheck = ['cbr', 'form1', 'grantedCertificate'];
        for (const field of filesToCheck) {
            if (req.files[field] && req.files[field][0].size > 500 * 1024) {
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return res.status(400).json({
                    success: false,
                    message: `${label} is too large (${(req.files[field][0].size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.`
                });
            }
        }

        const trimmedTitle = data.title.trim();

        // 2. Duplicate Validation
        const existingRecord = await Patent.findOne({
            title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i')
        });

        if (existingRecord) {
            return res.status(400).json({
                success: false,
                message: "A patent entry with this title already exists. If it was rejected, please use the Edit & Resubmit option instead of creating a new one."
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
                publishedstatus: data.publishedstatus || 'no',
                publisheddate: data.publisheddate || undefined,
                publishedexpectedamount: data.publishedexpectedamount ? Number(data.publishedexpectedamount) : (data.status === 'Published' ? 5000 : undefined),
                publishedinsentiveappllieddate: (data.status === 'Published' && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? new Date() : undefined
            },
            granted: {
                grantedstatus: data.grantedstatus || 'no',
                granteddate: data.granteddate || undefined,
                grantedexpectedamount: data.grantedexpectedamount ? Number(data.grantedexpectedamount) : (data.status === 'Granted' ? 15000 : undefined),
                grantedinsentiveappllieddate: (data.status === 'Granted' && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? new Date() : undefined
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
            const field = Object.keys(err.keyValue)[0];
            const value = err.keyValue[field];
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

        // Validate file sizes
        const filesToCheck = ['cbr', 'form1', 'grantedCertificate'];
        if (req.files) {
            for (const field of filesToCheck) {
                if (req.files[field] && req.files[field][0].size > 500 * 1024) {
                    const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    return res.status(400).json({
                        success: false,
                        message: `${label} is too large. Maximum allowed size is 500KB.`
                    });
                }
            }
        }

        // Validate Title for duplicates
        if (data.title) {
            const checkTitle = data.title.trim();
            const existingRecord = await Patent.findOne({
                _id: { $ne: id },
                title: new RegExp(`^${escapeRegex(checkTitle)}$`, 'i')
            });

            if (existingRecord) {
                return res.status(400).json({
                    success: false,
                    message: "A patent entry with this title already exists."
                });
            }
        }

        const currentStatus = data.status || patent.patentStatus;
        const currentFilingDate = data.dateOfFiling !== undefined ? data.dateOfFiling : patent.dateOfFiling;
        const currentPublishedDate = data.dateOfPublished !== undefined ? data.dateOfPublished : patent.dateOfPublished;
        const currentGrantedDate = data.dateOfGranted !== undefined ? data.dateOfGranted : patent.dateOfGranted;

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
        if (data.dateOfFiling && isFutureDate(data.dateOfFiling)) {
            return res.status(400).json({ success: false, message: "Date of Filing cannot be in the future." });
        }
        if (data.dateOfPublished && isFutureDate(data.dateOfPublished)) {
            return res.status(400).json({ success: false, message: "Publication Date cannot be in the future." });
        }
        if (data.dateOfGranted && isFutureDate(data.dateOfGranted)) {
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
            publishedstatus: data.publishedstatus || patent.published?.publishedstatus || 'no',
            publishedexpectedamount: data.publishedexpectedamount ? Number(data.publishedexpectedamount) : (isPublishedNow ? 5000 : patent.published?.publishedexpectedamount),
            publishedincentiveamount: patent.published?.publishedincentiveamount,
            publisheddate: data.publisheddate || patent.published?.publisheddate,
            publishedinsentiveappllieddate: (isPublishedNow && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? new Date() : patent.published?.publishedinsentiveappllieddate
        };

        patent.granted = {
            grantedstatus: data.grantedstatus || patent.granted?.grantedstatus || 'no',
            grantedexpectedamount: data.grantedexpectedamount ? Number(data.grantedexpectedamount) : (isGrantedNow ? 15000 : patent.granted?.grantedexpectedamount),
            grantedincentiveamount: patent.granted?.grantedincentiveamount,
            granteddate: data.granteddate || patent.granted?.granteddate,
            grantedinsentiveappllieddate: (isGrantedNow && (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes')) ? new Date() : patent.granted?.grantedinsentiveappllieddate
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

        const grantedInfo = {
            ...patent.granted,
            grantedstatus: 'yes',
            granteddate: data.granteddate,
            grantedexpectedamount: patent.granted?.grantedexpectedamount || 15000,
            grantedinsentiveappllieddate: (patent.applyIncentive === 'Yes' || patent.applyIncentive === 'yes') ? new Date() : undefined
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
                hodComment: '',
                rndComment: '',
                appraisalEligible: null,
                eligibleForTechTransfer: data.eligibleForTechTransfer || 'No',
                granted: grantedInfo,
                grantedCertificate: grantedCertificatePath
            },
            $unset: {
                approvedAmount: 1
            }
        }, { new: true }).populate('facultyId', 'name employeeId college').populate('academicYear', 'year');

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
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');

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
        const patent = await Patent.findByIdAndUpdate(id, {
            status,
            hodComment: comment
        }, { new: true });

        
        try {
            const NotificationService = require('../../modules/notification/notification.service');
            const targetFacultyId = patent.facultyId || patent.facultyId?._id;
            
            if (targetFacultyId) {
                await NotificationService.sendNotification({
                    recipientId: targetFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: action === 'Approve' ? 'SUCCESS' : 'ERROR',
                    title: `Patent ${action}d by HOD`,
                    message: `Your Patent has been ${action.toLowerCase()}d by HOD.`,
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
                        message: `A Patent application is pending your approval.`,
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
            .populate('academicYear', 'year');
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
            
            if (patent.patentStatus === 'Published') {
                if (!patent.published) patent.published = {};
                patent.published.publishedincentiveamount = approvedAmount;
            } else if (patent.patentStatus === 'Granted') {
                if (!patent.granted) patent.granted = {};
                patent.granted.grantedincentiveamount = approvedAmount;
            }
        }
        if (action === 'Approve' && req.body.appraisalEligible && ['Yes', 'No'].includes(req.body.appraisalEligible)) {
            patent.appraisalEligible = req.body.appraisalEligible;
        }

        // Scenario 2: If appraisalEligible = 'No', clear any previously auto-assigned claimant
        if (status === 'Approved' && req.body.appraisalEligible === 'No') {
            patent.appraisalClaimant = null;
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
