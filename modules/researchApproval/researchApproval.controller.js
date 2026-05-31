const Employee = require('../employee/employee.model');
const Textbook = require('../Textbook/Textbook.model');
const BookChapter = require('../BookChapter/BookChapter.model');
const Journal = require('../Journal/Journal.model');
const Patent = require('../Patent/Patent.model');
const FundedProject = require('../FundedProject/FundedProject.model');
const Consultancy = require('../Consultancy/Consultancy.model');
const Conference = require('../Conference/Conference.model');
const PhdApplication = require('../PhdScholar/PhdApplication.model');
const NovelProduct = require('../NovelProduct/NovelProduct.model');

const { getHODDepartments } = require('../../utils/hodHelper');
const escapeRegex = require('../../utils/escapeRegex');

// @desc    Get all research requests for HOD departments or Research Admin
// @route   GET /api/research-approval
// @access  Private (HOD, Research Dean, Research Coordinator)
exports.getResearchRequests = async (req, res) => {
    try {
        const {
            type,
            status,
            duration,
            fromDate,
            toDate,
            search
        } = req.query;

        // Check if user has research management roles
        const userRoleNames = req.user.roles?.map(r => r.role?.toUpperCase()) || [];
        const isResearchAdmin = userRoleNames.includes('RESEARCH_DEAN') || userRoleNames.includes('RESEARCH_COORDINATOR');
        const isHOD = userRoleNames.includes('HOD');

        console.log(`[DEBUG] Research Approval Access - User: ${req.user.userId}, isResearchAdmin: ${isResearchAdmin}`);

        let facultyIds = [];
        let facultyMap = {};

        if (isResearchAdmin) {
            // Deans and Coordinators see everything at institutional level
        } else if (isHOD) {
            // Get HOD Departments using robust helper
            const deptIds = await getHODDepartments(req.user);

            if (deptIds.length === 0) {
                return res.json({ success: true, data: [] });
            }

            // Fetch faculty for these departments (matching either coreDepartment or department)
            const facultyDocs = await Employee.find({
                $or: [
                    { coreDepartment: { $in: deptIds } },
                    { department: { $in: deptIds } }
                ]
            }).select('_id name institutionId department coreDepartment profileImage');
            facultyIds = facultyDocs.map(f => f._id);
            facultyMap = facultyDocs.reduce((acc, f) => {
                acc[f._id.toString()] = f;
                return acc;
            }, {});
        } else {
            return res.status(403).json({ success: false, message: "Unauthorized access to research requests." });
        }

        // Build Base Query for Research Requests
        let query = {};
        if (!isResearchAdmin) {
            query.facultyId = { $in: facultyIds };
        }

        // Status Filter Logic
        if (status && status !== 'All') {
            if (status === 'Pending') {
                if (isResearchAdmin) query.status = 'Pending at R&D';
                else query.status = 'Pending at HOD';
            }
            else if (status === 'Approved') {
                if (isResearchAdmin) query.status = 'Approved';
                else query.status = { $in: ['Pending at R&D', 'Approved'] };
            }
            else if (status === 'Rejected') {
                if (isResearchAdmin) query.status = 'Rejected by R&D';
                else query.status = 'Rejected by HOD';
            }
            else query.status = status;
        } else if (!status) {
            // Default view when NO status is provided (initial load)
            if (isResearchAdmin) query.status = 'Pending at R&D';
            else if (isHOD) query.status = 'Pending at HOD';
        }

        // Date Filter
        if (duration && duration !== 'All') {
            const now = new Date();
            let pastDate = new Date();
            if (duration === '1month') {
                pastDate.setMonth(now.getMonth() - 1);
            } else if (duration === '6months') {
                pastDate.setMonth(now.getMonth() - 6);
            } else if (duration === '1year') {
                pastDate.setFullYear(now.getFullYear() - 1);
            }
            query.createdAt = { $gte: pastDate, $lte: now };
        } else if (fromDate && toDate) {
            query.createdAt = {
                $gte: new Date(fromDate),
                $lte: new Date(new Date(toDate).setHours(23, 59, 59, 999))
            };
        }

        // Search Filter
        let searchRegex = null;
        if (search) {
            searchRegex = new RegExp(escapeRegex(search), 'i');
        }

        let allRequests = [];

        // Fetch from specific collections based on 'type' parameter
        const typesToFetch = type && type !== 'All' ? [type] : ['Text Book', 'Book Chapter', 'Journal', 'Patent', 'Funded Project', 'Consultancy', 'Conference', 'Ph.D. Scholar', 'Novel Product'];

        if (typesToFetch.includes('Text Book')) {
            let textbookQuery = { ...query };

            if (searchRegex && !isResearchAdmin) {
                textbookQuery.$or = [{ title: searchRegex }];
            }

            const textbooks = await Textbook.find(textbookQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of textbooks) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.title);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }

                allRequests.push({
                    _id: item._id,
                    type: 'Text Book',
                    faculty: fac,
                    title: item.title,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment,
                    approvedAmount: item.approvedAmount
                });
            }
        }

        // Fetch Book Chapters
        if (typesToFetch.includes('Book Chapter')) {
            let chapterQuery = { ...query };

            if (searchRegex && !isResearchAdmin) {
                chapterQuery.$or = [
                    { chapterTitle: searchRegex },
                    { textBookName: searchRegex }
                ];
            }

            const chapters = await BookChapter.find(chapterQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of chapters) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.chapterTitle) || searchRegex.test(item.textBookName);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }

                allRequests.push({
                    _id: item._id,
                    type: 'Book Chapter',
                    faculty: fac,
                    title: `${item.chapterTitle} (in ${item.textBookName})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment,
                    approvedAmount: item.approvedAmount
                });
            }
        }

        // Fetch Journals
        if (typesToFetch.includes('Journal')) {
            let journalQuery = { ...query };

            if (searchRegex && !isResearchAdmin) {
                journalQuery.$or = [
                    { paperTitle: searchRegex },
                    { journalName: searchRegex }
                ];
            }

            const journals = await Journal.find(journalQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of journals) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.paperTitle) || searchRegex.test(item.journalName);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }

                allRequests.push({
                    _id: item._id,
                    type: 'Journal',
                    faculty: fac,
                    title: `${item.paperTitle} (${item.journalName})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment,
                    approvedAmount: item.approvedAmount
                });
            }
        }

        // Fetch Patents
        if (typesToFetch.includes('Patent')) {
            let patentQuery = { ...query };
            
            if (searchRegex && !isResearchAdmin) {
                patentQuery.$or = [
                    { title: searchRegex },
                    { filingNo: searchRegex }
                ];
            }
            
            const patents = await Patent.find(patentQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of patents) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.title) || searchRegex.test(item.filingNo);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Patent',
                    faculty: fac,
                    title: `${item.title} (Filing No: ${item.filingNo})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment,
                    approvedAmount: item.approvedAmount
                });
            }
        }

        // Fetch Funded Projects
        if (typesToFetch.includes('Funded Project')) {
            let projectQuery = { ...query };
            
            if (searchRegex && !isResearchAdmin) {
                projectQuery.$or = [{ title: searchRegex }, { fundingAgency: searchRegex }];
            }
            
            const projects = await FundedProject.find(projectQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of projects) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.title) || searchRegex.test(item.fundingAgency);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Funded Project',
                    faculty: fac,
                    title: `${item.title} (${item.fundingAgency})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment,
                });
            }
        }

        // Fetch Consultancies
        if (typesToFetch.includes('Consultancy')) {
            let consultancyQuery = { ...query };
            
            if (searchRegex && !isResearchAdmin) {
                consultancyQuery.$or = [{ title: searchRegex }, { organization: searchRegex }];
            }
            
            const consultancies = await Consultancy.find(consultancyQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of consultancies) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.title) || searchRegex.test(item.organization);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Consultancy',
                    faculty: fac,
                    title: `${item.title} (${item.organization})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment,
                    approvedAmount: item.approvedAmount
                });
            }
        }

        // Fetch Conferences
        if (typesToFetch.includes('Conference')) {
            let conferenceQuery = { ...query };
            
            if (searchRegex && !isResearchAdmin) {
                conferenceQuery.$or = [{ title: searchRegex }, { conferenceName: searchRegex }];
            }
            
            const conferences = await Conference.find(conferenceQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of conferences) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.title) || searchRegex.test(item.conferenceName);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Conference',
                    faculty: fac,
                    title: `${item.title} (${item.conferenceName})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment,
                    approvedAmount: item.approvedAmount
                });
            }
        }

        // Fetch Ph.D. Scholar Applications
        if (typesToFetch.includes('Ph.D. Scholar')) {
            let phdQuery = { ...query };
            
            if (searchRegex && !isResearchAdmin) {
                phdQuery.$or = [{ studentName: searchRegex }, { rollNumber: searchRegex }];
            }
            
            const phdApps = await PhdApplication.find(phdQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of phdApps) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.studentName) || searchRegex.test(item.rollNumber);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Ph.D. Scholar',
                    faculty: fac,
                    title: `${item.studentName} (${item.rollNumber} - ${item.scholarStatus})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment
                });
            }
        }

        // Fetch Novel Products
        if (typesToFetch.includes('Novel Product')) {
            let productQuery = { ...query };
            
            if (searchRegex && !isResearchAdmin) {
                productQuery.$or = [{ productName: searchRegex }, { description: searchRegex }];
            }
            
            const products = await NovelProduct.find(productQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of products) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.productName) || searchRegex.test(item.description);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Novel Product',
                    faculty: fac,
                    title: `${item.productName} (${item.category})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment
                });
            }
        }

        // Sort combined results by date descending
        allRequests.sort((a, b) => b.createdAt - a.createdAt);

        res.json({
            success: true,
            data: allRequests
        });

    } catch (error) {
        console.error("Get Research Requests Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
// @desc    Get detailed research data for reports
// @route   GET /api/research-approval/reports
// @access  Private (Research Dean, Research Coordinator)
exports.getResearchReports = async (req, res) => {
    try {
        const { academicYear, type } = req.query;
        
        let reportData = {
            journals: [],
            textbooks: [],
            chapters: []
        };

        const query = { status: 'Approved' }; // Only approved records for regular reports? 
        // Or all records? User screenshot shows "Research Incentives", usually implies Approved.
        
        if (academicYear && academicYear !== 'All') {
            query.academicYear = academicYear;
        }

        // 1. Fetch Textbooks
        if (!type || type === 'All' || type === 'Text Book') {
            const textbooks = await Textbook.find(query)
                .populate({
                    path: 'facultyId',
                    select: 'name institutionId department coreDepartment panNumber',
                    populate: { path: 'coreDepartment', select: 'name' }
                })
                .populate('academicYear', 'year')
                .lean();
            
            reportData.textbooks = textbooks.map(item => ({
                sNo: '',
                dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                facultyName: item.facultyId?.name || 'N/A',
                empId: item.facultyId?.institutionId || 'N/A',
                title: item.title,
                publisher: item.publisher,
                isbn: item.isbn ? `\t${item.isbn}` : 'N/A', // Force string in Excel with tab
                year: item.academicYear?.year || item.yearOfPublication,
                amount: item.approvedAmount || 0,
                panNo: item.facultyId?.panNumber || 'N/A'
            }));
        }

        // 2. Fetch Book Chapters
        if (!type || type === 'All' || type === 'Book Chapter') {
            const chapters = await BookChapter.find(query)
                .populate({
                    path: 'facultyId',
                    select: 'name institutionId department coreDepartment panNumber',
                    populate: { path: 'coreDepartment', select: 'name' }
                })
                .populate('academicYear', 'year')
                .lean();

            reportData.chapters = chapters.map(item => ({
                sNo: '',
                dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                facultyName: item.facultyId?.name || 'N/A',
                empId: item.facultyId?.institutionId || 'N/A',
                chapterTitle: item.chapterTitle,
                bookName: item.textBookName,
                publisher: item.publisher,
                year: item.academicYear?.year || item.yearOfPublication,
                month: item.month,
                amount: item.approvedAmount || 0,
                panNo: item.facultyId?.panNumber || 'N/A'
            }));
        }

        // 3. Journals (Assuming a Journal model exists or using generic logic)
        // If Journal model doesn't exist, we skip or add a placeholder
        // Based on user screenshots, I should try to find where Journals are stored.
        // I'll add a dummy for now if not found.

        res.json({ success: true, data: reportData });

    } catch (error) {
        console.error("Get Research Reports Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
