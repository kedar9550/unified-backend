const Journal = require('./Journal.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureYearMonth } = require('../../utils/validationHelper');

// @desc    Submit new journal publication
// @route   POST /api/research/journal
// @access  Private (Faculty)
exports.createJournal = async (req, res) => {
    try {
        const data = req.body;

        // Validation
        if (!data.doi || !data.doi.trim()) {
            return res.status(400).json({ success: false, message: "DOI is mandatory." });
        }
        if (!data.paperTitle || !data.paperTitle.trim()) {
            return res.status(400).json({ success: false, message: "Paper Title is mandatory." });
        }

        const cleanedDoi = data.doi.trim();
        const trimmedTitle = data.paperTitle.trim();

        // Check if there is an active (Pending or Approved) submission with the same DOI or Title
        const existingActiveJournal = await Journal.findOne({
            $or: [
                { doi: cleanedDoi },
                { paperTitle: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i') }
            ],
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingActiveJournal) {
            return res.status(400).json({
                success: false,
                message: `A journal submission with this DOI (${cleanedDoi}) or Paper Title already exists and is either Pending or Approved. Duplicates are not allowed unless the previous submission was rejected.`
            });
        }

        // Date Validation (Not future)
        if (data.publishedYear && data.publishedMonth) {
            if (isFutureYearMonth(data.publishedYear, data.publishedMonth)) {
                return res.status(400).json({ success: false, message: "Publication date cannot be in the future." });
            }
        }

        if (!req.files || !req.files.publishedPaper || !req.files.referencePages || !req.files.completeJournal) {
            return res.status(400).json({ success: false, message: "All documents are mandatory." });
        }

        // Validate completeJournal type strictly to PDF or DOCX (no images allowed)
        if (req.files.completeJournal) {
            const path = require('path');
            const ext = path.extname(req.files.completeJournal[0].originalname).toLowerCase();
            if (ext !== '.pdf' && ext !== '.docx') {
                return res.status(400).json({ success: false, message: "Complete Journal must be a PDF or DOCX file." });
            }
        }

        // Check file sizes individually (500KB limit as per standard)
        const filesToCheck = ['publishedPaper', 'referencePages', 'completeJournal'];
        for (const field of filesToCheck) {
            if (req.files[field] && req.files[field][0].size > 500 * 1024) {
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                return res.status(400).json({
                    success: false,
                    message: `${label} is too large (${(req.files[field][0].size / 1024).toFixed(1)}KB). Maximum allowed size is 500KB.`
                });
            }
        }

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

        let numberOfReferencesBelongingToAGEC = 0;
        if (data.agecReferencingNumbers && data.agecReferencingNumbers.trim()) {
            if (/[^0-9,]/.test(data.agecReferencingNumbers)) {
                return res.status(400).json({ success: false, message: "AGEC Referencing Numbers must only contain numbers and commas." });
            }
            numberOfReferencesBelongingToAGEC = data.agecReferencingNumbers.split(',').map(s => s.trim()).filter(Boolean).length;
        }

        // Fetch JCR Impact Factor from JournalImpactFactor collection
        const JournalImpactFactor = require('../JournalImpactFactor/JournalImpactFactor.model');
        const searchName = (data.journalName || '').trim().toUpperCase();
        const jifRecord = await JournalImpactFactor.findOne({
            journalName: new RegExp(`^${escapeRegex(searchName)}$`)
        });

        const jcrImpactFactor = jifRecord ? jifRecord.jif.toString() : data.jcrImpactFactor || null;


        const applicant = await Employee.findById(req.user.userId).select('institutionId');
        const applicantEmpId = applicant ? applicant.institutionId : null;
        const computedIncentiveClaimant = (data.applyIncentive === 'Yes' || data.applyIncentive === 'yes') ? applicantEmpId : null;
        const journal = new Journal({
            ...data,
            facultyId: req.user.userId,
            coAuthors: resolvedAuthors,
            numberOfReferencesBelongingToAGEC,
            appraisalClaimant,
            jcrImpactFactor,
            status: 'Pending at R&D'
            ,
            incentiveClaimant: computedIncentiveClaimant
        });

        if (req.files) {
            if (req.files.publishedPaper) journal.publishedPaper = `/uploads/journals/${req.files.publishedPaper[0].filename}`;
            if (req.files.referencePages) journal.referencePages = `/uploads/journals/${req.files.referencePages[0].filename}`;
            if (req.files.completeJournal) journal.completeJournal = `/uploads/journals/${req.files.completeJournal[0].filename}`;
        }

        await journal.save();

        // Target: Send notification to the applicant's reporting boss
        try {
            const { getReportingBossId } = require('../hierarchy/reportingBoss.helper');
            const NotificationService = require('../notification/notification.service');

            const emp = await Employee.findById(req.user.userId);
            if (emp) {
                const bossUserId = await getReportingBossId(req.user.userId);
                if (bossUserId) {
                    await NotificationService.sendNotification({
                        recipientId: bossUserId,
                        senderId: req.user.userId,
                        module: 'Research',
                        type: 'INFO',
                        title: 'New Research Submission',
                        message: `${emp.name || 'A faculty member'} has submitted a new Journal: ${journal.paperTitle}`,
                        link: `/research/approvals`, 
                        metadata: { targetRole: "ReportingBoss" }
                    });
                }
            }
        } catch (notifErr) {
            console.error("Failed to send journal notification:", notifErr);
            // Non-blocking error
        }

        res.status(201).json({ success: true, data: journal });
    } catch (err) {
        console.error("Create Journal Error:", err);
        if (err.code === 11000) {
            const field = Object.keys(err.keyValue)[0];
            const message = `A journal with this ${field === 'paperTitle' ? 'title' : 'DOI'} already exists.`;
            return res.status(400).json({ success: false, message });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own journals and journals where they are a co-author
// @route   GET /api/research/journal
// @access  Private (Faculty)
exports.getMyJournals = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);

        const escapeRegex = (string) => {
            return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        };

        const query = {
            $or: [
                { facultyId: req.user.userId },
                { 'coAuthors.employeeId': user ? user.institutionId : null },
                ...(user && user.name ? [{ 'coAuthors.name': new RegExp(`^${escapeRegex(user.name.trim())}$`, 'i') }] : [])
            ]
        };

        const journals = await Journal.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')

            .sort({ createdAt: -1 });

        // Add a visibilityRole to indicate if the user is Applicant or Co-Author
        const journalsWithVisibility = journals.map(j => {
            const jObj = j.toObject();
            if (j.facultyId && j.facultyId._id.toString() !== req.user.userId.toString()) {
                jObj.visibilityRole = "Co-Author";
            } else {
                jObj.visibilityRole = "Applicant";
            }
            return jObj;
        });

        res.json({ success: true, data: journalsWithVisibility });
    } catch (err) {
        console.error("Get My Journals Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get journal by ID
// @route   GET /api/research/journal/:id
// @access  Private
exports.getJournalById = async (req, res) => {
    try {
        const journal = await Journal.findById(req.params.id)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year')


        if (!journal) {
            return res.status(404).json({ success: false, message: 'Journal not found' });
        }
        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const { getHODDepartments } = require('../../utils/hodHelper');

// @desc    Get journals pending at HOD
// @route   GET /api/research/journal/pending-hod
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

        const journals = await Journal.find({
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');

        res.json({ success: true, data: journals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/journal/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, hIndex, jcrImpactFactor, impactFactor } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const updates = {
            status,
            hodComment: comment
        };

        if (hIndex !== undefined) updates.hIndex = hIndex;
        const finalJcrImpactFactor = jcrImpactFactor !== undefined ? jcrImpactFactor : impactFactor;
        if (finalJcrImpactFactor !== undefined) updates.jcrImpactFactor = finalJcrImpactFactor;
        if (req.body.citations !== undefined) updates.citations = req.body.citations;

        const journal = await Journal.findByIdAndUpdate(id, updates, { new: true });

        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get journals pending at R&D
// @route   GET /api/research/journal/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const journals = await Journal.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: journals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/journal/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment, approvedAmount } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const finalJcrImpactFactor = req.body.jcrImpactFactor !== undefined ? req.body.jcrImpactFactor : req.body.impactFactor;

        if (action === 'Approve' && !req.body.appraisalEligible) {
            return res.status(400).json({ success: false, message: 'Appraisal Eligible is required for approval.' });
        }

        const journal = await Journal.findById(id);
        if (!journal) {
            return res.status(404).json({ success: false, message: 'Journal not found' });
        }

        journal.status = status;
        journal.rndComment = comment;
        if (approvedAmount !== undefined) journal.approvedAmount = approvedAmount;
        if (req.body.hIndex !== undefined) journal.hIndex = req.body.hIndex;
        if (finalJcrImpactFactor !== undefined) journal.jcrImpactFactor = finalJcrImpactFactor;
        if (req.body.citations !== undefined) journal.citations = req.body.citations;
        if (req.body.journalQuartile !== undefined) journal.journalQuartile = req.body.journalQuartile;
        if (req.body.journalType !== undefined) journal.journalType = req.body.journalType;
        if (req.body.appraisalEligible !== undefined) journal.appraisalEligible = req.body.appraisalEligible;

        // Auto-assign logic for Appraisal Claimant
        if (status === 'Approved' && req.body.appraisalEligible === 'Yes') {
            const AppraisalConfig = require('../Appraisal/AppraisalConfig.model');
            const isAppraisalActive = await AppraisalConfig.findOne({ academicYearId: journal.academicYear, isActive: true });
            
            if (isAppraisalActive) {
                let auFacultyCount = 1; // The applicant is always 1 AU Faculty
                const eligibleClaimants = [journal.facultyId.toString()];

                if (journal.coAuthors && journal.coAuthors.length > 0) {
                    journal.coAuthors.forEach(ca => {
                        if (ca.affiliation === 'Aditya University' && ca.CoAuthorType === 'faculty' && ca.employeeId) {
                            if (!eligibleClaimants.includes(ca.employeeId.toString())) {
                                auFacultyCount++;
                                eligibleClaimants.push(ca.employeeId.toString());
                            }
                        }
                    });
                }

                // If only 1 AU Faculty, auto-assign to applicant
                if (auFacultyCount === 1) {
                    journal.appraisalClaimant = journal.facultyId;
                }
            }
        }

        if (status === 'Approved' && (journal.applyIncentive === 'Yes' || journal.applyIncentive === 'yes') && journal.appraisalClaimant) {
            journal.incentiveClaimant = journal.appraisalClaimant;
        }

        await journal.save();
        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const axios = require('axios');

exports.getClarivateJournalType = async (req, res) => {
    const { issn } = req.body;

    if (!issn) {
        return res.status(400).json({ success: false, message: 'issn is required' });
    }

    try {
        const clarivateUrl = process.env.CLARIVATE_RANK_SEARCH_API_URL || 'https://mjl.clarivate.com/api/mjl/jprof/public/rank-search';
        const response = await axios.post(
            clarivateUrl,
            {
                searchValue: issn,
                pageNum: 1,
                pageSize: 10,
                sortOrder: [{ name: 'RELEVANCE', order: 'DESC' }],
                filters: [{
                    filterName: 'COVERED_LATEST_JEDI',
                    matchType: 'BOOLEAN_EXACT',
                    caseSensitive: false,
                    values: [{ type: 'VALUE', value: 'true' }]
                }],
                searchIdentifier: 'proxy-' + Date.now()
            },
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'x-1p-appid': 'mjl',
                    'origin': 'https://mjl.clarivate.com',
                    'referer': 'https://mjl.clarivate.com/search-results',
                    'authorization': 'Bearer'
                }
            }
        );

        const profiles = response.data?.journalProfiles || [];
        const types = new Set();

        profiles.forEach(p => {
            const jp = p?.journalProfile || {};

            const jcrCategories = jp.jcrCategories || [];
            jcrCategories.forEach(cat => {
                const edition = (cat?.jcrEdition || '').toUpperCase();
                if (['SCIE', 'SCI', 'ESCI', 'SSCI', 'AHCI'].includes(edition)) {
                    types.add(edition);
                }
            });

            if (types.size === 0) {
                const products = jp.products || [];
                products.forEach(prod => {
                    const desc = (prod?.description || '').toUpperCase();
                    if (desc.includes('SCIENCE CITATION INDEX EXPANDED')) types.add('SCIE');
                    else if (desc.includes('SCIENCE CITATION INDEX')) types.add('SCI');
                    if (desc.includes('SOCIAL SCIENCES CITATION')) types.add('SSCI');
                    if (desc.includes('ARTS & HUMANITIES')) types.add('AHCI');
                    if (desc.includes('EMERGING SOURCES')) types.add('ESCI');
                });
            }
        });

        return res.json({
            success: true,
            inWoS: types.size > 0,
            journalType: types.size > 0 ? [...types].join(' / ') : null,
            totalRecords: response.data?.totalRecords || 0
        });

    } catch (err) {
        const status = err.response?.status || 500;
        const message = err.response?.data || err.message;
        console.error('Clarivate proxy error:', status, message);
        return res.status(status).json({ success: false, message: typeof message === 'object' ? JSON.stringify(message) : message });
    }
};

// @desc    Update Journal Metrics (H-Index, Impact Factor, Citations) at any time
// @route   PUT /api/research/journal/update-metrics/:id
// @access  Private (R&D Admin)
exports.updateJournalMetrics = async (req, res) => {
    try {
        const { id } = req.params;
        const { hIndex, jcrImpactFactor, impactFactor, citations, journalQuartile, journalType } = req.body;

        const updates = {};
        if (hIndex !== undefined) updates.hIndex = hIndex;
        const finalJcrImpactFactor = jcrImpactFactor !== undefined ? jcrImpactFactor : impactFactor;
        if (finalJcrImpactFactor !== undefined) updates.jcrImpactFactor = finalJcrImpactFactor;
        if (citations !== undefined) updates.citations = citations;
        if (journalQuartile !== undefined) updates.journalQuartile = journalQuartile;
        if (journalType !== undefined) updates.journalType = journalType;

        const journal = await Journal.findByIdAndUpdate(id, updates, { new: true })
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment designation phone contactNumber college profileImage',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('academicYear', 'year');

        if (!journal) {
            return res.status(404).json({ success: false, message: 'Journal not found' });
        }

        res.json({ success: true, data: journal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.fetchDoiDetails = async (req, res) => {
    const { doi } = req.body;
    if (!doi) {
        return res.status(400).json({ success: false, message: 'DOI is required' });
    }

    try {
        const ELSEVIER_API_KEY = process.env.SCOPUS_API_KEY;
        const headers = {
            "X-ELS-APIKey": ELSEVIER_API_KEY,
            Accept: "application/json",
        };

        const cleanDoi = doi.trim();
        let metadata = {
            title: "",
            journalName: "",
            vol: "",
            issue: "",
            pageRange: "",
            month: "",
            year: "",
            issn: "",
            eissn: "",
            isScopus: "No",
            journalQuartile: "None",
            journalType: "None"
        };

        let foundInScopus = false;

        // Step 1: Scopus API Check
        try {
            const scopusBaseUrl = process.env.SCOPUS_SEARCH_API_URL || 'https://api.elsevier.com/content/search/scopus';
            const scopusUrl = `${scopusBaseUrl}?query=DOI(${encodeURIComponent(cleanDoi)})`;
            const scopusRes = await axios.get(scopusUrl, { headers });

            const entry = scopusRes.data?.["search-results"]?.entry?.[0];
            if (entry && !entry.error && (entry["dc:title"] || entry["prism:publicationName"])) {
                if (entry.subtype === "cp" || entry["prism:aggregationType"] === "Conference Proceeding") {
                    return res.status(400).json({ success: false, message: "Only journal papers are allowed. Conference papers are not accepted." });
                }

                foundInScopus = true;
                metadata.isScopus = "Yes";
                metadata.title = entry["dc:title"] || "";
                metadata.journalName = entry["prism:publicationName"] || "";
                metadata.vol = entry["prism:volume"] || "";
                metadata.issue = entry["prism:issueIdentifier"] || "";
                metadata.pageRange = entry["prism:pageRange"] || "";

                const rawIssn = entry["prism:issn"] || "";
                const rawEissn = entry["prism:eIssn"] || "";
                if (rawIssn) metadata.issn = rawIssn.split(" ")[0].replace(/-/g, "");
                if (rawEissn) metadata.eissn = rawEissn.split(" ")[0].replace(/-/g, "");

                const coverDisplayDate = entry["prism:coverDisplayDate"] || "";
                if (coverDisplayDate) {
                    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                    const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const yearMatch = coverDisplayDate.match(/\b(19|20)\d{2}\b/);
                    if (yearMatch) metadata.year = yearMatch[0];
                    for (let i = 0; i < 12; i++) {
                        if (
                            coverDisplayDate.toLowerCase().includes(monthNames[i].toLowerCase()) ||
                            coverDisplayDate.toLowerCase().includes(shortMonths[i].toLowerCase())
                        ) {
                            metadata.month = monthNames[i];
                            break;
                        }
                    }
                    if (!metadata.month) {
                        const isoMatch = coverDisplayDate.match(/\d{4}-(\d{2})/);
                        if (isoMatch) metadata.month = monthNames[parseInt(isoMatch[1], 10) - 1] || "";
                    }
                }
            }
        } catch (err) {
            console.error("Scopus API Error:", err.message);
            // Handle rate limit or unauth separately if needed, but for now we just fallback
            if (err.response && err.response.status === 429) {
                return res.status(429).json({ success: false, message: "Elsevier/Scopus API rate limit exceeded. Please try again later or fill fields manually." });
            }
        }

        // Step 1B: If not found in Scopus, use Crossref
        let foundInCrossref = false;
        if (!foundInScopus) {
            try {
                const crossrefBaseUrl = process.env.CROSSREF_API_URL || 'https://api.crossref.org/works';
                const crossrefUrl = `${crossrefBaseUrl}/${encodeURIComponent(cleanDoi)}`;
                const crossrefRes = await axios.get(crossrefUrl);
                const item = crossrefRes.data?.message;

                if (item && item.title && item.title.length > 0) {
                    foundInCrossref = true;
                    metadata.isScopus = "No";
                    metadata.title = item.title[0] || "";
                    metadata.journalName = (item["container-title"] && item["container-title"][0]) || "";
                    metadata.vol = item.volume || "";
                    metadata.issue = item.issue || "";
                    metadata.pageRange = item.page || "";

                    if (item.ISSN && item.ISSN.length > 0) {
                        // Crossref can return multiple ISSNs (print, electronic)
                        const issn1 = item.ISSN[0].replace(/-/g, "");
                        const issn2 = item.ISSN.length > 1 ? item.ISSN[1].replace(/-/g, "") : "";
                        if (item["issn-type"]) {
                            item["issn-type"].forEach(t => {
                                if (t.type === "print") metadata.issn = t.value.replace(/-/g, "");
                                if (t.type === "electronic") metadata.eissn = t.value.replace(/-/g, "");
                            });
                        }
                        if (!metadata.issn && !metadata.eissn) {
                            metadata.issn = issn1;
                            metadata.eissn = issn2;
                        }
                    }

                    // Extract date
                    const published = item["published-print"] || item["published-online"] || item.published || item.created;
                    if (published && published["date-parts"] && published["date-parts"][0]) {
                        const parts = published["date-parts"][0];
                        if (parts[0]) metadata.year = parts[0].toString();
                        if (parts[1]) {
                            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                            metadata.month = monthNames[parts[1] - 1] || "";
                        }
                    }
                }
            } catch (err) {
                console.error("Crossref API Error:", err.message);
            }
        }

        if (!foundInScopus && !foundInCrossref) {
            return res.status(404).json({
                success: false,
                message: "DOI not found in Scopus or Crossref. Please enter details manually."
            });
        }

        const activeIssn = metadata.issn || metadata.eissn;

        // Step 2: Calculate Quartile (Only if found in Scopus)
        if (foundInScopus && activeIssn) {
            try {
                let serialDataFetched = false;
                let serialEntry = {};

                const fetchSerial = async (issnToTry) => {
                    if (!issnToTry) return false;
                    const serialBaseUrl = process.env.SCOPUS_SERIAL_API_URL || 'https://api.elsevier.com/content/serial/title/issn';
                    const serialRes = await axios.get(
                        `${serialBaseUrl}/${issnToTry}?view=CITESCORE`,
                        { headers }
                    );
                    serialEntry = serialRes.data?.["serial-metadata-response"]?.entry?.[0] || {};
                    return true;
                };

                serialDataFetched = await fetchSerial(metadata.issn).catch(() => false);
                if (!serialDataFetched && metadata.eissn) {
                    serialDataFetched = await fetchSerial(metadata.eissn).catch(() => false);
                }

                if (serialDataFetched) {
                    const csYearInfo = serialEntry?.citeScoreYearInfoList?.citeScoreYearInfo;
                    let highestPercentile = null;

                    if (Array.isArray(csYearInfo) && csYearInfo.length > 0) {
                        const sortedYears = [...csYearInfo].sort((a, b) => parseInt(b["@year"] || 0) - parseInt(a["@year"] || 0));
                        const latestYearInfo = sortedYears[0];
                        const infoList = latestYearInfo.citeScoreInformationList || [];
                        let percentiles = [];

                        infoList.forEach(info => {
                            const csInfo = info.citeScoreInfo || [];
                            csInfo.forEach(cs => {
                                const subjectRanks = cs.citeScoreSubjectRank || [];
                                subjectRanks.forEach(sr => {
                                    if (sr.percentile) {
                                        const pVal = parseFloat(sr.percentile);
                                        if (!isNaN(pVal)) percentiles.push(pVal);
                                    }
                                });
                            });
                        });

                        if (percentiles.length > 0) {
                            highestPercentile = Math.max(...percentiles);
                        }
                    }

                    if (highestPercentile !== null) {
                        if (highestPercentile >= 75) metadata.journalQuartile = "Q1";
                        else if (highestPercentile >= 50) metadata.journalQuartile = "Q2";
                        else if (highestPercentile >= 25) metadata.journalQuartile = "Q3";
                        else metadata.journalQuartile = "Q4";
                    }
                }
            } catch (err) {
                console.error("Scopus Serial API Error:", err.message);
            }
        }

        // Step 3: Clarivate/WoS Type Check
        if (activeIssn) {
            try {
                const formatISSNWithHyphen = (raw) => {
                    if (!raw) return "";
                    const digits = raw.replace(/-/g, "");
                    if (digits.length === 8) return digits.slice(0, 4) + "-" + digits.slice(4);
                    return digits;
                };

                let wosDataFetched = false;

                // Helper to perform the Clarivate search using the proxy we already have logic for
                // Note: Since we are inside the same controller, we can't easily call our own `exports.getClarivateJournalType`
                // because it expects `req` and `res`. So we implement the axios call directly here or extract a helper.

                const fetchWoSType = async (issnToTry) => {
                    if (!issnToTry) return false;
                    const wosIssn = formatISSNWithHyphen(issnToTry);
                    const clarivateUrl = process.env.CLARIVATE_RANK_SEARCH_API_URL || 'https://mjl.clarivate.com/api/mjl/jprof/public/rank-search';
                    const response = await axios.post(
                        clarivateUrl,
                        {
                            searchValue: wosIssn,
                            pageNum: 1,
                            pageSize: 10,
                            sortOrder: [{ name: 'RELEVANCE', order: 'DESC' }],
                            filters: [{
                                filterName: 'COVERED_LATEST_JEDI',
                                matchType: 'BOOLEAN_EXACT',
                                caseSensitive: false,
                                values: [{ type: 'VALUE', value: 'true' }]
                            }],
                            searchIdentifier: 'proxy-' + Date.now()
                        },
                        {
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'x-1p-appid': 'mjl',
                                'origin': 'https://mjl.clarivate.com',
                                'referer': 'https://mjl.clarivate.com/search-results',
                                'authorization': 'Bearer'
                            }
                        }
                    );

                    const profiles = response.data?.journalProfiles || [];
                    const types = new Set();

                    profiles.forEach(p => {
                        const jp = p?.journalProfile || {};
                        const jcrCategories = jp.jcrCategories || [];
                        jcrCategories.forEach(cat => {
                            const edition = (cat?.jcrEdition || '').toUpperCase();
                            if (['SCIE', 'SCI', 'ESCI', 'SSCI', 'AHCI'].includes(edition)) {
                                types.add(edition);
                            }
                        });

                        if (types.size === 0) {
                            const products = jp.products || [];
                            products.forEach(prod => {
                                const desc = (prod?.description || '').toUpperCase();
                                if (desc.includes('SCIENCE CITATION INDEX EXPANDED')) types.add('SCIE');
                                else if (desc.includes('SCIENCE CITATION INDEX')) types.add('SCI');
                                if (desc.includes('SOCIAL SCIENCES CITATION')) types.add('SSCI');
                                if (desc.includes('ARTS & HUMANITIES')) types.add('AHCI');
                                if (desc.includes('EMERGING SOURCES')) types.add('ESCI');
                            });
                        }
                    });

                    if (types.size > 0) {
                        metadata.journalType = [...types].join(' / ');
                        return true;
                    }
                    return false;
                };

                wosDataFetched = await fetchWoSType(metadata.issn).catch(() => false);
                if (!wosDataFetched && metadata.eissn) {
                    wosDataFetched = await fetchWoSType(metadata.eissn).catch(() => false);
                }

            } catch (err) {
                console.error("Clarivate Proxy Error in fetchDoiDetails:", err.message);
            }
        }

        return res.json({
            success: true,
            data: metadata
        });

    } catch (err) {
        console.error("fetchDoiDetails Overall Error:", err);
        return res.status(500).json({ success: false, message: "Internal server error while fetching DOI details." });
    }
};

