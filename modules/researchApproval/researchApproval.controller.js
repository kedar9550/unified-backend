const mongoose = require('mongoose');
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
const { calculateJournalIncentive } = require('../../utils/journalIncentiveCalculator');

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

        console.log(`[DEBUG] Research Approval Access - User: ${req.user.userId}, isResearchAdmin: ${isResearchAdmin}`);

        const { getFacultyIdsForApprover } = require('../hierarchy/reportingBoss.helper');
        
        let facultyIds = [];
        let facultyMap = {};

        if (!isResearchAdmin) {
            facultyIds = await getFacultyIdsForApprover(req.user);
        }

        const isHOD = userRoleNames.includes('HOD') || userRoleNames.includes('SCHOOL_DEAN') || userRoleNames.includes('SCHOOL DEAN') || facultyIds.length > 0;

        if (isResearchAdmin) {
            // Deans and Coordinators see everything at institutional level
        } else if (isHOD) {
            if (facultyIds.length === 0) {
                return res.json({ success: true, data: [] });
            }

            // Optional: Populate facultyMap if needed by subsequent code
            const facultyDocs = await Employee.find({
                _id: { $in: facultyIds }
            }).select('_id name institutionId department coreDepartment profileImage');
            
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
                query.status = isResearchAdmin ? 'Pending at R&D' : 'Pending';
            }
            else if (status === 'Approved') {
                query.status = 'Approved';
            }
            else if (status === 'Rejected') {
                query.status = isResearchAdmin ? 'Rejected by R&D' : 'Rejected';
            }
            else query.status = status;
        } else if (!status) {
            // Default view when NO status is provided (initial load)
            query.status = isResearchAdmin ? 'Pending at R&D' : 'Pending';
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
                    doi: item.doi,
                    isNoDoi: item.isNoDoi || (item.doi && String(item.doi).startsWith('NODOI') ? 'Yes' : 'No'),
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
                consultancyQuery.$or = [{ title: searchRegex }, { fundingAgency: searchRegex }];
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
                    const matchesTitle = searchRegex.test(item.title) || searchRegex.test(item.fundingAgency);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Consultancy',
                    faculty: fac,
                    title: `${item.title} (${item.fundingAgency})`,
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
                    title: `${item.studentName} (${item.rollNumber})`,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment
                });
            }
            console.log(`[DEBUG] Ph.D. Scholars fetched: ${phdApps.length}`);
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
        const { academicYear, type, startDate, endDate } = req.query;
        
        const query = {}; 
        if (academicYear && academicYear !== 'All') {
            query.academicYear = academicYear;
        }

        const getCreationDate = (item) => {
            if (item.createdAt) return item.createdAt;
            if (item.created) return item.created;
            if (item._id) {
                try {
                    return new mongoose.Types.ObjectId(item._id).getTimestamp();
                } catch (e) {
                    return null;
                }
            }
            return null;
        };

        const formatAppliedAt = (item) => {
            const dateVal = getCreationDate(item);
            if (!dateVal) return 'N/A';
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return 'N/A';
            return d.toLocaleString('en-IN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Kolkata'
            });
        };

        const formatAuthors = (authorsArray) => {
            if (!authorsArray || !Array.isArray(authorsArray)) return 'N/A';
            return authorsArray.map(author => {
                const name = author.name || author.authorName || '';
                const affiliation = author.affiliation || author.affiliationName || '';
                const empId = author.employeeId ? `, EmpID: ${author.employeeId}` : '';
                return `${name} (${affiliation}${empId})`;
            }).join('; ');
        };

        const shouldFetch = (cat) => !type || type === 'All' || type === cat;

        const populateOptions = {
            path: 'facultyId',
            select: 'name institutionId department coreDepartment panNumber college',
            populate: { path: 'coreDepartment', select: 'name' }
        };

        // Parallelize database queries across all requested categories
        const [textbooksRaw, chaptersRaw, journalsRaw, conferencesRaw, patentsRaw, projectsRaw, productsRaw, consultanciesRaw] = await Promise.all([
            shouldFetch('Text Book') ? Textbook.find(query).populate(populateOptions).populate('academicYear', 'year').lean() : Promise.resolve([]),
            shouldFetch('Book Chapter') ? BookChapter.find(query).populate(populateOptions).populate('academicYear', 'year').lean() : Promise.resolve([]),
            shouldFetch('Journal') ? Journal.find(query).populate(populateOptions).populate('academicYear', 'year').lean() : Promise.resolve([]),
            shouldFetch('Conference') ? Conference.find(query).populate(populateOptions).populate('academicYear', 'year').lean() : Promise.resolve([]),
            shouldFetch('Patent') ? Patent.find(query).populate(populateOptions).populate('academicYear', 'year').lean() : Promise.resolve([]),
            shouldFetch('Funded Project') ? FundedProject.find(query).populate(populateOptions).populate('academicYear', 'year').lean() : Promise.resolve([]),
            shouldFetch('Novel Product') ? NovelProduct.find(query).populate(populateOptions).populate('academicYear', 'year').lean() : Promise.resolve([]),
            shouldFetch('Consultancy') ? Consultancy.find(query).populate(populateOptions).populate('academicYear', 'year').lean() : Promise.resolve([])
        ]);

        const filterByDateRange = (list) => {
            if (!startDate && !endDate) return list;
            const start = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
            const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;
            return list.filter(item => {
                const d = getCreationDate(item);
                if (!d) return false;
                const time = new Date(d).getTime();
                if (start && time < start) return false;
                if (end && time > end) return false;
                return true;
            });
        };

        const textbooksFiltered = filterByDateRange(textbooksRaw);
        const chaptersFiltered = filterByDateRange(chaptersRaw);
        const journalsFiltered = filterByDateRange(journalsRaw);
        const conferencesFiltered = filterByDateRange(conferencesRaw);
        const patentsFiltered = filterByDateRange(patentsRaw);
        const projectsFiltered = filterByDateRange(projectsRaw);
        const productsFiltered = filterByDateRange(productsRaw);
        const consultanciesFiltered = filterByDateRange(consultanciesRaw);

        const reportData = {
            textbooks: textbooksFiltered.map(item => ({
                sNo: '',
                dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                facultyName: item.facultyId?.name || 'N/A',
                empId: item.facultyId?.institutionId || 'N/A',
                title: item.title,
                publisher: item.publisher,
                isbn: item.isbn ? `\t${item.isbn}` : 'N/A',
                scopusIndexed: item.scopusIndexed || 'No',
                year: item.academicYear?.year || item.yearOfPublication,
                amount: item.approvedAmount || 0,
                panNo: item.facultyId?.panNumber || 'N/A',
                status: item.status || 'Pending at R&D',
                coAuthorsText: formatAuthors(item.authors),
                appliedAt: formatAppliedAt(item)
            })),

            chapters: chaptersFiltered.map(item => ({
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
                panNo: item.facultyId?.panNumber || 'N/A',
                status: item.status || 'Pending at R&D',
                coAuthorsText: formatAuthors(item.coAuthors),
                appliedAt: formatAppliedAt(item)
            })),

            journals: journalsFiltered.map(item => {
                let category = 'SCOPUS';
                const quartile = (item.journalQuartile || '').toUpperCase().trim();
                if (quartile === 'Q1') category = 'Q1';
                else if (quartile === 'Q2') category = 'Q2';

                return {
                    sNo: '',
                    empId: item.facultyId?.institutionId || 'N/A',
                    facultyName: item.facultyId?.name || 'N/A',
                    college: item.college || item.facultyId?.college || 'N/A',
                    panNo: item.panNumber || item.facultyId?.panNumber || 'N/A',
                    dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                    isNoDoi: item.isNoDoi || 'No',
                    doi: item.doi || 'N/A',
                    journalName: item.journalName || 'N/A',
                    paperTitle: item.paperTitle || 'N/A',
                    year: item.academicYear?.year || item.publishedYear || 'N/A',
                    issn: item.issn || 'N/A',
                    eissn: item.eissn || 'N/A',
                    isScopus: item.isScopus || 'No',
                    isWos: item.isWos || 'No',
                    journalQuartile: item.journalQuartile || 'N/A',
                    journalType: item.journalType || 'None',
                    journalCategory: item.journalCategory || 'N/A',
                    vol: item.vol || 'N/A',
                    issue: item.issue || 'N/A',
                    hIndex: item.hIndex || 'N/A',
                    jcrImpactFactor: item.jcrImpactFactor || 'N/A',
                    citations: item.citations || 'N/A',
                    sdgs: item.sdgs || 'N/A',
                    correspondingAuthor: item.correspondingAuthor || 'No',
                    applyIncentive: item.applyIncentive || 'No',
                    amount: item.approvedAmount || 0,
                    approvedAmount: item.approvedAmount || 0,
                    appraisalEligible: item.appraisalEligible || 'N/A',
                    appraisalClaimant: item.appraisalClaimant || 'N/A',
                    category: category,
                    status: item.status || 'Pending at R&D',
                    coAuthorsText: formatAuthors(item.coAuthors),
                    appliedAt: formatAppliedAt(item)
                };
            }),

            conferences: conferencesFiltered.map(item => ({
                sNo: '',
                empId: item.facultyId?.institutionId || 'N/A',
                facultyName: item.facultyId?.name || 'N/A',
                college: item.college || item.facultyId?.college || 'N/A',
                panNo: item.panNumber || item.facultyId?.panNumber || 'N/A',
                dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                doi: item.doi || 'N/A',
                conferenceName: item.conferenceName || 'N/A',
                paperTitle: item.title || 'N/A',
                academicYear: item.academicYear?.year || 'N/A',
                year: item.academicYear?.year || item.year || 'N/A',
                month: item.month || 'N/A',
                publishedYear: item.year || 'N/A',
                location: item.location || 'India',
                conferenceType: item.conferenceType || 'N/A',
                scopusIndexed: item.scopusIndexed || 'No',
                issnIsbn: item.issnIsbn || 'N/A',
                publisher: item.publisher || 'N/A',
                isStudentsInvolved: item.isStudentsInvolved || 'No',
                applyingSeedGrant: item.applyingSeedGrant || 'No',
                applyIncentive: item.applyIncentive || 'No',
                amount: item.approvedAmount || 0,
                approvedAmount: item.approvedAmount || 0,
                appraisalEligible: item.appraisalEligible || 'N/A',
                appraisalClaimant: item.appraisalClaimant || 'N/A',
                sdgs: item.sdgs || 'N/A',
                status: item.status || 'Pending at R&D',
                coAuthorsText: formatAuthors(item.coAuthors),
                appliedAt: formatAppliedAt(item)
            })),

            patents: patentsFiltered.map(item => ({
                sNo: '',
                dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                facultyName: item.facultyId?.name || 'N/A',
                empId: item.facultyId?.institutionId || 'N/A',
                title: item.title || 'N/A',
                filingNo: item.filingNo || 'N/A',
                year: item.academicYear?.year || 'N/A',
                amount: item.approvedAmount || 0,
                panNo: item.panNumber || item.facultyId?.panNumber || 'N/A',
                status: item.status || 'Pending at R&D',
                coAuthorsText: formatAuthors(item.coInventors),
                appliedAt: formatAppliedAt(item)
            })),

            projects: projectsFiltered.map(item => ({
                sNo: '',
                dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                facultyName: item.facultyId?.name || 'N/A',
                empId: item.facultyId?.institutionId || 'N/A',
                title: item.title || 'N/A',
                agency: item.fundingAgency || 'N/A',
                year: item.academicYear?.year || item.year || 'N/A',
                amount: item.approvedAmount || 0,
                sanctionedAmount: item.sanctionedAmount || 'N/A',
                panNo: item.panNumber || item.facultyId?.panNumber || 'N/A',
                status: item.status || 'Pending at R&D',
                projectStatus: item.projectStatus || 'N/A',
                coAuthorsText: formatAuthors(item.coInvestigators),
                appliedAt: formatAppliedAt(item)
            })),

            products: productsFiltered.map(item => ({
                sNo: '',
                dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                facultyName: item.facultyId?.name || 'N/A',
                empId: item.facultyId?.institutionId || 'N/A',
                title: item.productName || 'N/A',
                category: item.category || 'N/A',
                organization: item.developedOrganization || item.implementedOrganization || 'N/A',
                year: item.academicYear?.year || item.year || 'N/A',
                panNo: item.panNumber || item.facultyId?.panNumber || 'N/A',
                status: item.status || 'Pending at R&D',
                coAuthorsText: formatAuthors(item.coDevelopers),
                appliedAt: formatAppliedAt(item)
            })),

            consultancy: consultanciesFiltered.map(item => ({
                sNo: '',
                dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                facultyName: item.facultyId?.name || 'N/A',
                empId: item.facultyId?.institutionId || 'N/A',
                title: item.title || 'N/A',
                agency: item.fundingAgency || 'N/A',
                year: item.academicYear?.year || item.year || 'N/A',
                amount: item.approvedAmount || 0,
                sanctionedAmount: item.amount || 'N/A',
                panNo: item.panNumber || item.facultyId?.panNumber || 'N/A',
                status: item.status || 'Pending at R&D',
                projectStatus: item.projectStatus || 'N/A',
                coAuthorsText: formatAuthors(item.coInvestigators),
                appliedAt: formatAppliedAt(item)
            }))
        };

        res.json({ success: true, data: reportData });

    } catch (error) {
        console.error("Get Research Reports Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Edit details of any research request in-place
// @route   PUT /api/hod/research-requests/:type/:id
// @access  Private (Research Dean, Research Coordinator)
exports.editResearchDetails = async (req, res) => {
    try {
        const { type, id } = req.params;
        const data = { ...req.body };

        // Map type string to mongoose model
        let Model;
        switch (type.toLowerCase()) {
            case 'textbook':
                Model = Textbook;
                break;
            case 'bookchapter':
            case 'book-chapter':
                Model = BookChapter;
                break;
            case 'journal':
                Model = Journal;
                break;
            case 'patent':
                Model = Patent;
                break;
            case 'fundedproject':
            case 'funded-project':
                Model = FundedProject;
                break;
            case 'consultancy':
                Model = Consultancy;
                break;
            case 'conference':
                Model = Conference;
                break;
            case 'novelproduct':
            case 'novel-product':
                Model = NovelProduct;
                break;
            case 'phdscholar':
            case 'phd-scholar':
            case 'ph.d. scholar':
            case 'ph.d.scholar':
                Model = PhdApplication;
                break;
            default:
                return res.status(400).json({ success: false, message: `Invalid research type: ${type}` });
        }

        const doc = await Model.findById(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: `${type} record not found` });
        }

        // Exclude critical/read-only fields from direct body modification
        const excludedFields = ['_id', 'facultyId', 'academicYear', 'createdAt', 'status'];
        excludedFields.forEach(field => {
            delete data[field];
        });

        // Parse complex sub-documents/arrays if passed as JSON strings
        const arrayFields = ['coAuthors', 'coDevelopers', 'coInvestigators', 'coInventors', 'sdgs'];
        arrayFields.forEach(field => {
            if (data[field] && typeof data[field] === 'string') {
                try {
                    data[field] = JSON.parse(data[field]);
                } catch (e) {
                    console.warn(`[WARNING] Failed to parse JSON for array field '${field}':`, e.message);
                }
            }
        });

        // Handle file uploads if sent in multipart/form-data
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                data[file.fieldname] = `/uploads/research_docs/${file.filename}`;
            });
        }

        // Specific mapping conversions if needed
        // dateOfFiling / admissionOrAwardDate / sanctionDate conversions
        if (data.dateOfFiling) data.dateOfFiling = new Date(data.dateOfFiling);
        if (data.admissionOrAwardDate) data.admissionOrAwardDate = new Date(data.admissionOrAwardDate);
        if (data.sanctionDate) data.sanctionDate = new Date(data.sanctionDate);

        // Auto-calculate number of references belonging to AGEC if modified
        if (data.agecReferencingNumbers !== undefined) {
            if (data.agecReferencingNumbers.trim()) {
                if (/[^0-9,]/.test(data.agecReferencingNumbers)) {
                    return res.status(400).json({ success: false, message: "AGEC Referencing Numbers must only contain numbers and commas." });
                }
                data.numberOfReferencesBelongingToAGEC = data.agecReferencingNumbers.split(',').map(s => s.trim()).filter(Boolean).length;
            } else {
                data.numberOfReferencesBelongingToAGEC = 0;
                data.agecReferencingNumbers = "";
            }
        }

        const oldApprovedAmount = doc.approvedAmount;
        const providedApprovedAmount = data.approvedAmount !== undefined ? Number(data.approvedAmount) : undefined;

        // Update document fields
        Object.assign(doc, data);

        if (type.toLowerCase() === 'journal') {
            if (doc.applyIncentive === 'Yes' || doc.applyIncentive === 'yes') {
                console.log(`[editResearchDetails] Recalculating incentive for journal ${doc._id}. userAuthorPosition: ${doc.userAuthorPosition}, totalAuthors: ${doc.totalAuthors}, isStudentsInvolved: ${doc.isStudentsInvolved}, applyingSeedGrant: ${doc.applyingSeedGrant}`);
                const incentiveCalc = calculateJournalIncentive(doc.toObject());
                if (incentiveCalc.success) {
                    console.log(`[editResearchDetails] Calculation successful. Old Amount: ${doc.estimatedIncentiveAmount}, New Amount: ${incentiveCalc.estimatedIncentiveAmount}`);
                    doc.estimatedIncentiveAmount = incentiveCalc.estimatedIncentiveAmount || 0;
                    
                    if (doc.status === 'Approved' && (providedApprovedAmount === undefined || providedApprovedAmount === oldApprovedAmount)) {
                        doc.approvedAmount = doc.estimatedIncentiveAmount;
                    }
                } else {
                    console.log(`[editResearchDetails] Calculation failed. Reason:`, incentiveCalc.missing);
                }
            } else {
                doc.estimatedIncentiveAmount = 0;
                if (doc.status === 'Approved' && (providedApprovedAmount === undefined || providedApprovedAmount === oldApprovedAmount)) {
                    doc.approvedAmount = 0;
                }
            }
        }

        // Save updated document
        const savedDoc = await doc.save();

        res.json({
            success: true,
            message: `${type} details updated successfully`,
            data: savedDoc
        });

    } catch (error) {
        console.error("Edit Research Details Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};