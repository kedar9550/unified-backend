const Conference = require('./Conference.model');
const Employee = require('../employee/employee.model');
const escapeRegex = require('../../utils/escapeRegex');
const { isFutureYearMonth } = require('../../utils/validationHelper');

// @desc    Submit new conference publication
// @route   POST /api/research/conference
// @access  Private (Faculty)
exports.createConference = async (req, res) => {
    try {
        const data = req.body;
        
        // 1. Mandatory Fields Validation
        if (!data.title || !data.conferenceName || !data.level || !data.indexing || !data.applyingSeedGrant || !data.applyIncentive) {
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
        const calculatedFirstAuthor = userAuthorPos === 1 ? "Yes" : "No";

        const conference = new Conference({
            ...data,
            title: trimmedTitle,
            facultyId: req.user.userId,
            firstAuthor: calculatedFirstAuthor,
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

        // Add a visibilityRole to indicate if the user is Applicant or Co-Author
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
