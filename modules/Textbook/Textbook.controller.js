const Textbook = require('./Textbook.model');
const Edition = require('./Edition.model');
const Employee = require('../employee/employee.model');
const axios = require('axios');

// @desc    Submit new textbook publication
// @route   POST /api/research/textbook
// @access  Private (Faculty)
exports.createTextbook = async (req, res) => {
    try {
        const data = req.body;
        
        // Trim and normalize ISBN
        if (data.isbn) data.isbn = data.isbn.trim().replace(/-/g, '');

        // 1. Duplicate Validation (ISBN or Title)
        if (!data.isbn || !data.title) {
            return res.status(400).json({ success: false, message: "ISBN and Title are required." });
        }

        const existingRecord = await Textbook.findOne({
            $or: [
                { isbn: data.isbn },
                { title: new RegExp(`^${data.title.trim()}$`, 'i') }
            ],
            status: { $in: ['Pending at HOD', 'Pending at R&D', 'Approved'] }
        });

        if (existingRecord) {
            return res.status(400).json({ 
                success: false, 
                message: "A textbook with this ISBN or Title already exists and is either Pending or Approved. Duplicate submissions are not allowed." 
            });
        }

        // Parse authors if it's a string (FormData sends arrays as strings)
        let parsedAuthors = [];
        if (typeof data.authors === 'string') {
            try {
                parsedAuthors = JSON.parse(data.authors);
            } catch (e) {
                parsedAuthors = [];
            }
        } else if (Array.isArray(data.authors)) {
            parsedAuthors = data.authors;
        }
        
        // Get the logged in user details to populate their author entry
        const loggedInUser = await Employee.findById(req.user.userId);

        // Map and validate authors
        const finalAuthors = parsedAuthors.map(author => {
            // Is this author the logged in user?
            const isUser = Number(author.authorPosition) === Number(data.userAuthorPosition);
            
            return {
                authorPosition: author.authorPosition,
                authorName: isUser ? loggedInUser.name : author.authorName,
                affiliationType: isUser ? 'Aditya University' : author.affiliationType,
                employeeId: isUser ? loggedInUser.institutionId : author.employeeId,
                affiliationName: isUser ? 'Aditya University' : author.affiliationName,
                isIncentiveApplicant: isUser ? (data.applyIncentive === 'Yes') : false,
                contributorOnly: isUser ? (data.applyIncentive === 'No') : true
            };
        });

        const textbook = new Textbook({
            ...data,
            isbn: data.isbn, // use normalized isbn
            college: data.college || 'Not Set',
            facultyId: req.user.userId,
            authors: finalAuthors,
            status: 'Pending at HOD'
        });

        if (req.files) {
            if (req.files.coverPage) textbook.coverPage = `/uploads/textbooks/${req.files.coverPage[0].filename}`;
            if (req.files.authorAffiliation) textbook.authorAffiliation = `/uploads/textbooks/${req.files.authorAffiliation[0].filename}`;
            if (req.files.index) textbook.index = `/uploads/textbooks/${req.files.index[0].filename}`;
        }

        await textbook.save();
        
        // Upsert Edition
        if (data.edition) {
            try {
                const normalizedEdition = data.edition.replace(/\s+/g, ' ').trim();
                await Edition.updateOne(
                    { name: normalizedEdition },
                    { $setOnInsert: { name: normalizedEdition } },
                    { upsert: true }
                );
            } catch (e) {
                console.error("Failed to upsert edition:", e);
            }
        }

        res.status(201).json({ success: true, data: textbook });
    } catch (err) {
        console.error("Create Textbook Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own textbooks and textbooks where they are a co-author
// @route   GET /api/research/textbook
// @access  Private (Faculty)
exports.getMyTextbooks = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.userId);
        const institutionId = user ? user.institutionId : null;

        const query = {
            $or: [
                { facultyId: req.user.userId },
                { 'authors.employeeId': institutionId }
            ]
        };

        const textbooks = await Textbook.find(query)
            .populate('academicYear', 'year')
            .populate('facultyId', 'name institutionId')
            .sort({ createdAt: -1 });

        // Add a field to indicate if the user is just a co-author for dashboard visibility
        const textbooksWithVisibility = textbooks.map(tb => {
            const tbObj = tb.toObject();
            if (tb.facultyId.toString() !== req.user.userId.toString()) {
                tbObj.visibilityRole = "Co-Author Only";
            } else {
                tbObj.visibilityRole = "Applicant";
            }
            return tbObj;
        });

        res.json({ success: true, data: textbooksWithVisibility });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Fetch Book Details by ISBN
// @route   GET /api/research/textbook/isbn/:isbn
// @access  Private
exports.fetchISBN = async (req, res) => {
    try {
        const isbn = req.params.isbn.trim().replace(/-/g, '');
        const response = await axios.get(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
        
        const bookKey = `ISBN:${isbn}`;
        if (response.data && response.data[bookKey]) {
            const bookData = response.data[bookKey];
            res.json({
                success: true,
                data: {
                    title: bookData.title,
                    publisher: bookData.publishers ? bookData.publishers.map(p => p.name).join(', ') : '',
                    yearOfPublication: bookData.publish_date ? bookData.publish_date : ''
                }
            });
        } else {
            res.status(404).json({ success: false, message: "Book details not found for this ISBN." });
        }
    } catch (err) {
        console.error("ISBN Fetch Error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch book details from external API." });
    }
};

// @desc    Get all editions for dropdown
// @route   GET /api/research/textbook/editions
// @access  Private
exports.getEditions = async (req, res) => {
    try {
        const editions = await Edition.find({}).sort({ createdAt: 1 });
        res.json({ success: true, data: editions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Add a new custom edition
// @route   POST /api/research/textbook/editions
// @access  Private
exports.addEdition = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "Edition name is required." });

        const newEdition = new Edition({ name });
        await newEdition.save();

        res.status(201).json({ success: true, data: newEdition });
    } catch (err) {
        // Handle unique constraint error
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: "This edition already exists." });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};


// @desc    Get textbooks pending at HOD
// @route   GET /api/research/textbook/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        const Employee = require('../employee/employee.model');
        const deptIds = req.user.hodDepartments || [];
        
        const facultyIds = await Employee.find({ department: { $in: deptIds } }).distinct('_id');
        
        const textbooks = await Textbook.find({ 
            facultyId: { $in: facultyIds },
            status: 'Pending at HOD'
        }).populate('facultyId', 'name institutionId department').populate('academicYear', 'year');
        
        res.json({ success: true, data: textbooks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD Action (Approve/Reject)
// @route   PUT /api/research/textbook/hod-action/:id
// @access  Private (HOD)
exports.hodAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Pending at R&D' : 'Rejected by HOD';
        const textbook = await Textbook.findByIdAndUpdate(id, { 
            status, 
            hodComment: comment 
        }, { new: true });

        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get textbooks pending at R&D
// @route   GET /api/research/textbook/pending-rnd
// @access  Private (R&D)
exports.getPendingAtRND = async (req, res) => {
    try {
        const textbooks = await Textbook.find({ status: 'Pending at R&D' })
            .populate('facultyId', 'name institutionId department')
            .populate('academicYear', 'year');
        res.json({ success: true, data: textbooks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D Action (Approve/Reject)
// @route   PUT /api/research/textbook/rnd-action/:id
// @access  Private (R&D)
exports.rndAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comment } = req.body;

        const status = action === 'Approve' ? 'Approved' : 'Rejected by R&D';
        const textbook = await Textbook.findByIdAndUpdate(id, { 
            status, 
            rndComment: comment 
        }, { new: true });

        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Raise discrepancy for approved textbook
// @route   PUT /api/research/textbook/raise-discrepancy/:id
// @access  Private (Faculty)
exports.raiseDiscrepancy = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        
        const updates = {
            discrepancyRaised: true,
            discrepancyComment: comment
        };

        if (req.file) {
            updates.discrepancyProof = req.file.filename;
        }

        const textbook = await Textbook.findByIdAndUpdate(id, updates, { new: true });
        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    R&D edit after discrepancy
// @route   PUT /api/research/textbook/rnd-edit/:id
// @access  Private (R&D)
exports.rndEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        if (typeof data.authors === 'string') {
            try {
                data.authors = JSON.parse(data.authors);
            } catch (e) {}
        }

        const textbook = await Textbook.findById(id);
        if (!textbook) return res.status(404).json({ success: false, message: "Textbook not found" });

        // Merge updates
        Object.assign(textbook, data);
        textbook.discrepancyRaised = false; // Resolved
        
        if (req.files) {
            if (req.files.coverPage) textbook.coverPage = `/uploads/textbooks/${req.files.coverPage[0].filename}`;
            if (req.files.authorAffiliation) textbook.authorAffiliation = `/uploads/textbooks/${req.files.authorAffiliation[0].filename}`;
            if (req.files.index) textbook.index = `/uploads/textbooks/${req.files.index[0].filename}`;
        }

        await textbook.save();
        res.json({ success: true, data: textbook });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
