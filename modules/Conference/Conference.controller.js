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

        // Must be 'cp' = Conference Paper
        if (subtype && subtype !== "cp") {
            return {
                valid: false,
                message: `Only conference papers are allowed. This DOI is classified as "${subtypeDesc}" in Scopus. Journal publications are not accepted here.`
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

        const trimmedTitle = data.title.trim();

        // 2. Duplicate Validation
        const existingRecord = await Conference.findOne({
            title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i'),
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingRecord) {
            return res.status(400).json({
                success: false,
                message: "A conference paper entry with this title already exists and is either Pending or Approved. Duplicate submissions are not allowed."
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

        const conference = new Conference({
            ...data,
            title: trimmedTitle,
            facultyId: req.user.userId,
            doi: data.doi || null,
            scopusSubtype,                  // ← NEW: store confirmed subtype
            userAuthorPosition: userAuthorPos,
            totalAuthors: totalAuths,
            coAuthors: resolvedAuthors,
            certificate,
            proceedings,
            appraisalClaimant,
            status: 'Pending at HOD'
        });

        await conference.save();
        res.status(201).json({ success: true, data: conference });
    } catch (err) {
        console.error("Create Conference Error:", err);
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

        conference.status = status;
        conference.rndComment = comment;
        if (approvedAmount !== undefined) {
            conference.approvedAmount = approvedAmount;
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

        if (subtype && subtype !== "cp") {
            return res.status(422).json({
                success: false,
                message: `Only conference papers are allowed. This DOI is classified as "${subtypeDesc}" in Scopus. Journal publications are not accepted.`,
                detectedType: subtypeDesc
            });
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
