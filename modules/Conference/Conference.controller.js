const Conference = require('./Conference.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureYearMonth } = require('../../utils/validationHelper');

// Node < 18 needs node-fetch. Node >= 18 has built-in fetch.
// Uncomment the line below if you're on Node < 18:
// const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const SCOPUS_API_KEY = process.env.SCOPUS_API_KEY; // set in your .env file

// ── Helper: validate DOI against Scopus and confirm it's a conference paper ──
// Returns: { valid: true } if conference paper
// Returns: { valid: false, message: "..." } if journal or not found
// Returns: { valid: true, skipped: true } if Scopus call fails (don't block)
const validateScopusConferencePaper = async (doi) => {
    try {
        const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, "");

        const res = await fetch(
            `https://api.elsevier.com/content/search/scopus?query=DOI(${encodeURIComponent(cleanDoi)})`,
            {
                headers: {
                    "X-ELS-APIKey": SCOPUS_API_KEY,
                    "Accept": "application/json"
                }
            }
        );

        // If Scopus API is down or key missing, skip validation (don't block submission)
        if (!res.ok) {
            console.warn(`[Scopus Backend] API returned ${res.status} — skipping validation`);
            return { valid: true, skipped: true };
        }

        const json = await res.json();
        const entry = json?.["search-results"]?.entry?.[0];

        // DOI not in Scopus
        if (!entry || entry.error) {
            return {
                valid: false,
                message: "DOI not found in Scopus. Only Scopus-indexed conference papers are accepted."
            };
        }

        const subtype = entry["subtype"] || "";
        const subtypeDesc = entry["subtypeDescription"] || subtype;
        const aggregationType = entry["prism:aggregationType"] || "";

        // Must be 'cp' = Conference Paper or 'Conference Proceeding'
        const isConference = (subtype === "cp") || (aggregationType === "Conference Proceeding");

        if (!isConference) {
            return {
                valid: false,
                message: `Only conference papers are allowed. This DOI is classified as "${subtypeDesc || aggregationType}" in Scopus. Journal publications are not accepted here.`
            };
        }

        return { valid: true, subtype: subtype || "cp" };

    } catch (err) {
        // Network error — skip validation, don't block user
        console.warn("[Scopus Backend] Validation fetch failed:", err.message);
        return { valid: true, skipped: true };
    }
};

// @desc    Submit new conference publication
// @route   POST /api/research/conference
// @access  Private (Faculty)
exports.createConference = async (req, res) => {
    try {
        const data = req.body;

        // 1. Mandatory Fields Validation
        if (!data.title || !data.conferenceName || !data.scope || !data.indexing || !data.applyingSeedGrant || !data.applyIncentive) {
            return res.status(400).json({ success: false, message: "Please fill all required fields." });
        }

        // 2. Duplicate Validation (Flexible whitespace regex for Title + DOI check)
        const trimmedTitle = data.title.trim();
        const cleanDoi = data.doi ? data.doi.trim().replace(/^https?:\/\/doi\.org\//i, "") : null;

        const regexTitlePattern = `^${escapeRegex(trimmedTitle).replace(/\\\s+/g, '\\s+')}$`;
        const duplicateConditions = [
            { title: new RegExp(regexTitlePattern, 'i') }
        ];
        if (cleanDoi) {
            duplicateConditions.push({ doi: cleanDoi });
        }

        const existingRecord = await Conference.findOne({
            $or: duplicateConditions
        });

        if (existingRecord) {
            const isDoiMatch = cleanDoi && existingRecord.doi && existingRecord.doi.toLowerCase() === cleanDoi.toLowerCase();
            return res.status(400).json({
                success: false,
                message: isDoiMatch
                    ? `A conference paper entry with this DOI (${cleanDoi}) already exists in the system. If it was rejected, please use the Edit & Resubmit option instead of creating a new one.`
                    : `A conference paper entry with this Title ("${trimmedTitle}") already exists in the system. If it was rejected, please use the Edit & Resubmit option instead of creating a new one.`
            });
        }

        // 3. Date Validation (Not future)
        if (data.year && data.month) {
            if (isFutureYearMonth(data.year, data.month)) {
                return res.status(400).json({ success: false, message: "Publication date cannot be in the future." });
            }
        }

        // ── 4. SCOPUS CONFERENCE PAPER VALIDATION (Backend Guard) ────────────────
        // This re-validates even if frontend already checked — prevents API bypass via Postman/curl
        let scopusSubtype = "cp";
        if (data.doi) {
            const scopusCheck = await validateScopusConferencePaper(data.doi);
            if (!scopusCheck.valid) {
                return res.status(422).json({
                    success: false,
                    message: scopusCheck.message
                });
            }
            if (!scopusCheck.skipped) {
                scopusSubtype = scopusCheck.subtype || "cp";
            }
        }
        // ────────────────────────────────────────────────────────────────────────────

        const files = req.files || {};
        const certificate = files.certificate ? `/uploads/conferences/${files.certificate[0].filename}` : null;
        const proceedings = files.proceedings ? `/uploads/conferences/${files.proceedings[0].filename}` : null;

        // Parse co-authors
        let parsedCoAuthors = [];
        if (typeof data.coAuthors === 'string') {
            try {
                parsedCoAuthors = JSON.parse(data.coAuthors);
            } catch (e) {
                parsedCoAuthors = [];
            }
        } else if (Array.isArray(data.coAuthors)) {
            parsedCoAuthors = data.coAuthors;
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoAuthors, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        const userAuthorPos = parseInt(data.userAuthorPosition) || 1;
        const totalAuths = parseInt(data.totalAuthors) || 1;

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantEmpId = applicant ? applicant.institutionId : null;
        let computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? applicantEmpId : null;

        let finalFacultyId = req.user.userId;
        let finalStatus = 'Pending at R&D';
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

            if (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') {
                if (!data.approvedAmount || Number(data.approvedAmount) <= 0) {
                    return res.status(400).json({ success: false, message: "Approved Incentive Amount is required when Apply Incentive is Yes." });
                }
            }

            if (!data.appraisalEligible) {
                return res.status(400).json({ success: false, message: "Appraisal Eligible status is required for direct entry." });
            }

            finalFacultyId = targetFaculty._id;
            finalStatus = 'Approved';
            finalEntryType = 'Admin';
            computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? targetFaculty.institutionId : null;
        }

        const conference = new Conference({
            ...data,
            title: trimmedTitle,
            facultyId: finalFacultyId,
            doi: data.doi || null,
            scopusSubtype,
            userAuthorPosition: userAuthorPos,
            totalAuthors: totalAuths,
            coAuthors: resolvedAuthors,
            certificate,
            proceedings,
            appraisalClaimant,
            status: finalStatus,
            incentiveClaimant: computedIncentiveClaimant,
            approvedAmount: (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? (data.approvedAmount ? Number(data.approvedAmount) : 0) : undefined,
            appraisalEligible: data.appraisalEligible || (data.isDirectEntry === 'true' ? 'Yes' : null),
            entryType: finalEntryType
        });

        await conference.save();

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
                        message: `${emp.name || 'A faculty member'} has submitted a new Conference: ${conference.title}`,
                        link: `/research/approvals`, 
                        metadata: { targetRole: "ReportingBoss" }
                    });
                }
            }

            if (data.isDirectEntry === 'true' && finalFacultyId.toString() !== req.user.userId) {
                 await NotificationService.sendNotification({
                    recipientId: finalFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: 'SUCCESS',
                    title: 'Conference Publication Added',
                    message: `R&D has directly added an approved Conference Publication for you: ${conference.title}`,
                    link: `/faculty/research-metrics`
                 });
            }
        } catch (notifErr) {
            console.error("Failed to send conference notification:", notifErr);
        }
        res.status(201).json({ success: true, data: conference });
    } catch (err) {
        console.error("Create Conference Error:", err);
        if (err.code === 11000) {
            const field = Object.keys(err.keyValue)[0];
            const message = `A conference with this ${field === 'title' ? 'title' : 'DOI'} already exists.`;
            return res.status(400).json({ success: false, message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Update and resubmit an existing rejected conference publication
// @route   PUT /api/research/conference/:id
// @access  Private (Faculty)
exports.updateConference = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const conference = await Conference.findById(id);
        if (!conference) {
            return res.status(404).json({ success: false, message: "Conference not found." });
        }

        // Verify ownership
        if (conference.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Not authorized to edit this conference." });
        }

        if (!conference.status.includes('Rejected')) {
            return res.status(400).json({ success: false, message: "Only rejected conferences can be edited and resubmitted." });
        }

        // Validate Title and DOI for duplicates (excluding self)
        const checkTitle = data.title ? data.title.trim() : null;
        const checkDoi = data.doi ? data.doi.trim().replace(/^https?:\/\/doi\.org\//i, "") : null;

        const updateDuplicateConditions = [];
        if (checkTitle) {
            const regexTitlePattern = `^${escapeRegex(checkTitle).replace(/\\\s+/g, '\\s+')}$`;
            updateDuplicateConditions.push({ title: new RegExp(regexTitlePattern, 'i') });
        }
        if (checkDoi) {
            updateDuplicateConditions.push({ doi: checkDoi });
        }

        if (updateDuplicateConditions.length > 0) {
            const existingConference = await Conference.findOne({
                _id: { $ne: id },
                $or: updateDuplicateConditions
            });

            if (existingConference) {
                return res.status(400).json({
                    success: false,
                    message: `Another conference paper entry with this Title or DOI already exists.`
                });
            }
        }

        // Date Validation
        if (data.year || data.month) {
            const year = data.year || conference.year;
            const month = data.month || conference.month;
            if (isFutureYearMonth(year, month)) {
                return res.status(400).json({ success: false, message: "Publication date cannot be in the future." });
            }
        }

        let scopusSubtype = conference.scopusSubtype;
        if (data.doi && data.doi !== conference.doi) {
            const scopusCheck = await validateScopusConferencePaper(data.doi);
            if (!scopusCheck.valid) {
                return res.status(422).json({
                    success: false,
                    message: scopusCheck.message
                });
            }
            if (!scopusCheck.skipped) {
                scopusSubtype = scopusCheck.subtype || "cp";
            }
        }

        // Parse co-authors
        let parsedCoAuthors = conference.coAuthors;
        if (data.coAuthors) {
            if (typeof data.coAuthors === 'string') {
                try {
                    parsedCoAuthors = JSON.parse(data.coAuthors);
                } catch (e) {
                    parsedCoAuthors = [];
                }
            } else if (Array.isArray(data.coAuthors)) {
                parsedCoAuthors = data.coAuthors;
            }
        }

        const { resolveCoAuthorsAndClaims, getDefaultClaimant } = require('../../utils/claimantHelper');
        const { resolvedAuthors, hasOtherAusAuthors } = await resolveCoAuthorsAndClaims(parsedCoAuthors, req.user.userId);
        const appraisalClaimant = await getDefaultClaimant(hasOtherAusAuthors, req.user.userId);

        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantEmpId = applicant ? applicant.institutionId : null;
        const applyIncentive = data.applyIncentive !== undefined ? data.applyIncentive : conference.applyIncentive;
        const computedIncentiveClaimant = (applyIncentive === 'Yes' || applyIncentive === 'yes') ? applicantEmpId : null;

        // Update fields
        Object.keys(data).forEach(key => {
            if (key !== 'coAuthors' && key !== 'status' && key !== 'facultyId' && data[key] !== undefined) {
                conference[key] = data[key];
            }
        });

        conference.title = data.title ? data.title.trim() : conference.title;
        conference.coAuthors = resolvedAuthors;
        conference.scopusSubtype = scopusSubtype;
        conference.appraisalClaimant = appraisalClaimant;
        conference.incentiveClaimant = computedIncentiveClaimant;
        conference.status = 'Pending at R&D'; // Resubmit
        conference.hodComment = '';
        conference.rndComment = '';

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
                } catch (e) {}
            }
        };

        if (req.files) {
            if (req.files.certificate) {
                deleteOldFile(conference.certificate);
                conference.certificate = `/uploads/conferences/${req.files.certificate[0].filename}`;
            }
            if (req.files.proceedings) {
                deleteOldFile(conference.proceedings);
                conference.proceedings = `/uploads/conferences/${req.files.proceedings[0].filename}`;
            }
        }

        // Handle explicit removal of files without replacement
        if (data.deleteCertificate === 'true' && !req.files?.certificate) {
            deleteOldFile(conference.certificate);
            conference.certificate = null;
        }
        if (data.deleteProceedings === 'true' && !req.files?.proceedings) {
            deleteOldFile(conference.proceedings);
            conference.proceedings = null;
        }

        await conference.save();

        res.json({ success: true, data: conference });
    } catch (err) {
        console.error("Update Conference Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own conference publications and publications where they are a co-author
// @route   GET /api/research/conference
// @access  Private (Faculty)
exports.getMyConferences = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);

        const escapeRegex = (string) => {
            return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        };

        const query = {
            $or: [
                { facultyId: req.user.userId },
                ...(user && user.name ? [{ 'coAuthors.name': new RegExp(`^${escapeRegex(user.name.trim())}$`, 'i') }] : [])
            ]
        };

        const conferences = await Conference.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .populate('coAuthors.employeeId', 'name institutionId')
            .sort({ createdAt: -1 });

        const conferencesWithVisibility = conferences.map(c => {
            const cObj = c.toObject();
            if (c.facultyId && c.facultyId._id.toString() !== req.user.userId.toString()) {
                cObj.visibilityRole = "Co-Author";
            } else {
                cObj.visibilityRole = "Applicant";
            }
            return cObj;
        });

        res.json({ success: true, data: conferencesWithVisibility });
    } catch (err) {
        console.error("Get My Conferences Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get conference by ID
// @route   GET /api/research/conference/:id
// @access  Private
exports.getConferenceById = async (req, res) => {
    try {
        const conference = await Conference.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year')
            .populate('coAuthors.employeeId', 'name institutionId');

        if (!conference) {
            return res.status(404).json({ success: false, message: 'Conference not found' });
        }
        res.json({ success: true, data: conference });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/conference/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const conference = await Conference.findByIdAndUpdate(id, {
            status,
            hodComment: comment
        }, { new: true });

        res.json({ success: true, data: conference });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/conference/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, approvedAmount } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';

        const conference = await Conference.findById(id);
        if (!conference) {
            return res.status(404).json({ success: false, message: 'Conference not found' });
        }

        if (action === 'Approve') {
            if (!req.body.appraisalEligible) {
                return res.status(400).json({ success: false, message: 'Appraisal Eligible status is required for approval.' });
            }
            if (conference.applyIncentive === 'Yes' || conference.applyIncentive === 'yes') {
                if (approvedAmount === undefined || approvedAmount === null || approvedAmount === '' || Number(approvedAmount) <= 0) {
                    return res.status(400).json({ success: false, message: 'Approved Incentive Amount is required when Apply Incentive is Yes.' });
                }
            }
        }

        conference.status = status;
        conference.rndComment = comment;
        if (action === 'Approve' && approvedAmount !== undefined) {
            conference.approvedAmount = approvedAmount;
        }
        if (action === 'Approve' && req.body.appraisalEligible && ['Yes', 'No'].includes(req.body.appraisalEligible)) {
            conference.appraisalEligible = req.body.appraisalEligible;
        }

        if (status === 'Approved' && (conference.applyIncentive === 'Yes' || conference.applyIncentive === 'yes') && conference.appraisalClaimant) {
            conference.incentiveClaimant = conference.appraisalClaimant;
        }

        await conference.save();
        res.json({ success: true, data: conference });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    [NEW] Validate DOI via Scopus — used by frontend "Fetch Details" button
// @route   POST /api/research/conference/validate-doi
// @access  Private (Faculty)
// 
// HOW TO TEST IN POSTMAN:
//   POST http://localhost:9000/api/research/conference/validate-doi
//   Headers: Authorization: Bearer <your_token>
//   Body (JSON): { "doi": "10.1109/ICCR55977.2022.9995935" }
//
//   Expected responses:
//   ✅ Conference paper  → 200 { success: true, subtype: "cp", data: { title, publisher, conferenceName, ... } }
//   ❌ Journal article   → 422 { success: false, message: "Only conference papers are allowed..." }
//   ❌ Not in Scopus     → 404 { success: false, message: "DOI not found in Scopus." }
// ─────────────────────────────────────────────────────────────────────────────
exports.validateDOI = async (req, res) => {
    try {
        const { doi } = req.body;
        if (!doi || !doi.trim()) {
            return res.status(400).json({ success: false, message: "DOI is required." });
        }

        const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, "");

        // ── Step 0: Check if DOI already exists in DB ─────────────────────────
        const existingByDoi = await Conference.findOne({ doi: cleanDoi });
        if (existingByDoi) {
            return res.status(400).json({
                success: false,
                message: `A conference paper entry with this DOI (${cleanDoi}) already exists in the system. If it was rejected, please use the Edit & Resubmit option.`
            });
        }

        // ── Step 1: Scopus Search API ──────────────────────────────────────────
        const searchRes = await fetch(
            `https://api.elsevier.com/content/search/scopus?query=DOI(${encodeURIComponent(cleanDoi)})`,
            {
                headers: {
                    "X-ELS-APIKey": SCOPUS_API_KEY,
                    "Accept": "application/json"
                }
            }
        );

        if (!searchRes.ok) {
            return res.status(searchRes.status).json({
                success: false,
                message: searchRes.status === 401
                    ? "Scopus API key is invalid or unauthorized."
                    : searchRes.status === 429
                        ? "Scopus API rate limit exceeded. Try again later."
                        : `Scopus API error (HTTP ${searchRes.status}).`
            });
        }

        const searchJson = await searchRes.json();
        const entry = searchJson?.["search-results"]?.entry?.[0];

        // ── Step 2: Not found ──────────────────────────────────────────────────
        if (!entry || entry.error || (!entry["dc:title"] && !entry["prism:publicationName"])) {
            return res.status(404).json({
                success: false,
                message: entry?.error === "Result set was empty"
                    ? "This DOI was not found in Scopus. It may not be indexed."
                    : "DOI not found in Scopus."
            });
        }

        // ── Step 3: Conference paper check ────────────────────────────────────
        const subtype = entry["subtype"] || "";
        const subtypeDesc = entry["subtypeDescription"] || subtype;
        const aggregationType = entry["prism:aggregationType"] || "";

        const isConference = (subtype === "cp") || (aggregationType === "Conference Proceeding");

        if (!isConference) {
            return res.status(422).json({
                success: false,
                message: `Only conference papers are allowed. This DOI is classified as "${subtypeDesc || aggregationType}" in Scopus. Journal publications are not accepted.`,
                detectedType: subtypeDesc || aggregationType
            });
        }

        // ── Step 3.5: Check if fetched title already exists in DB ─────────────
        const fetchedTitle = entry["dc:title"] || "";
        if (fetchedTitle) {
            const regexTitlePattern = `^${escapeRegex(fetchedTitle.trim()).replace(/\\\s+/g, '\\s+')}$`;
            const existingByTitle = await Conference.findOne({
                title: new RegExp(regexTitlePattern, 'i')
            });
            if (existingByTitle) {
                return res.status(400).json({
                    success: false,
                    message: `A conference paper entry with the title "${fetchedTitle.trim()}" already exists in the system.`
                });
            }
        }

        // ── Step 4: Abstract Retrieval API for richer metadata ────────────────
        let confName = "";
        let publisher = entry["prism:publisher"] || entry["dc:publisher"] || "";

        try {
            const abstractRes = await fetch(
                `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(cleanDoi)}`,
                {
                    headers: {
                        "X-ELS-APIKey": SCOPUS_API_KEY,
                        "Accept": "application/json"
                    }
                }
            );

            if (abstractRes.ok) {
                const absJson = await abstractRes.json();
                const coredata = absJson?.["abstracts-retrieval-response"]?.coredata;
                const bibrecord = absJson?.["abstracts-retrieval-response"]?.bibrecord;

                // Conference name: deep path first, then publicationName fallback
                confName =
                    bibrecord?.head?.source?.["additional-srcinfo"]?.conferenceinfo?.confevent?.confname ||
                    coredata?.["prism:publicationName"] ||
                    entry["prism:publicationName"] ||
                    "";

                // Publisher from abstract retrieval is more reliable
                publisher = coredata?.["dc:publisher"] || publisher;
            }
        } catch (absErr) {
            console.warn("[Scopus Abstract] Retrieval failed, using Search API data only:", absErr.message);
            confName = entry["prism:publicationName"] || "";
        }

        // ── Step 5: Build and return payload ─────────────────────────────────
        const rawIssn = entry["prism:issn"] || entry["prism:eIssn"] || "";
        const issnClean = rawIssn.split(" ")[0].replace(/-/g, "");
        const issnIsbn = issnClean.length === 8
            ? `${issnClean.slice(0, 4)}-${issnClean.slice(4)}`
            : rawIssn.split(" ")[0];

        // Parse year/month from prism:coverDate (YYYY-MM-DD) or coverDisplayDate
        const dateRaw = entry["prism:coverDate"] || entry["prism:coverDisplayDate"] || "";
        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        let year = "", month = "";
        const isoMatch = dateRaw.match(/^(\d{4})-(\d{2})/);
        if (isoMatch) {
            year = isoMatch[1];
            month = monthNames[parseInt(isoMatch[2], 10) - 1] || "";
        }

        return res.status(200).json({
            success: true,
            subtype: subtype || "cp",
            subtypeDescription: subtypeDesc || "Conference Paper",
            data: {
                title:          entry["dc:title"]            || "",
                publisher:      publisher                    || "",
                conferenceName: confName                     || "",
                issnIsbn:       issnIsbn                     || "",
                year:           year                         || "",
                month:          month                        || "",
                scopusSourceTitle: entry["prism:publicationName"] || "",
                scopusId:       (entry["eid"] || "").replace("2-s2.0-", "")
            }
        });

    } catch (err) {
        console.error("validateDOI Error:", err);
        res.status(500).json({ success: false, message: "Server error during DOI validation." });
    }
};
