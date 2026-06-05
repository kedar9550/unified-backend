const mongoose = require("mongoose");
const Appraisal = require("./Appraisal.model");
const AppraisalConfig = require("./AppraisalConfig.model");
const AppraisalResearchClaim = require("./AppraisalResearchClaim.model");

// Import all related models
const Employee = require("../employee/employee.model");
const AcademicYear = require("../academicYear/academicYear.model");
const Department = require("../academics/department.model");
const FacultySubjectResult = require("../FacultySubjectResult/FacultySubjectResult.model");
const FacultyFeedResult = require("../FacultyFeedbackResults/FacultyFeedResult.model");
const FacultyProctoringEntry = require("../FacultyProctoringEntry/FacultyProctoringEntry.model");

// Research models
const Journal = require("../Journal/Journal.model");
const Conference = require("../Conference/Conference.model");
const Textbook = require("../Textbook/Textbook.model");
const BookChapter = require("../BookChapter/BookChapter.model");
const Patent = require("../Patent/Patent.model");
const PhdScholar = require("../PhdScholar/PhdScholar.model");
const NovelProduct = require("../NovelProduct/NovelProduct.model");
const FundedProject = require("../FundedProject/FundedProject.model");
const Consultancy = require("../Consultancy/Consultancy.model");

// Value Addition models
const ResourceUtilization = require("../ResourceUtilization/ResourceUtilization.model");
const Contribution = require("../Contribution/Contribution.model");
const FacultyAdministration = require("../FacultyAdministration/FacultyAdministration.model");

// Helper to match a value against config point ranges
function getPointsFromRanges(val, ranges) {
    if (!ranges || ranges.length === 0) return 0;
    const match = ranges.find(r => val >= r.min && val <= r.max);
    return match ? match.points : 0;
}

// Helper to calculate the base points of a journal publication based on custom rules
async function getJournalBasePoints(j, config) {
    const journalPointsConf = config.research?.journalPoints || {};
    
    // 1. Check if the journal exists in the journalmasters collection (top category)
    let isJournalMaster = false;
    if (j.journalName) {
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = await mongoose.connection.db.collection('journalmasters').findOne({
            title: { $regex: new RegExp(`^${escapeRegExp(j.journalName.trim())}$`, 'i') }
        });
        if (match) {
            isJournalMaster = true;
        }
    }

    if (isJournalMaster) {
        return journalPointsConf["IEEE / ASME / ASCE / ACM / FT-50 / Scopus Top 10%"] ?? 25;
    }

    const type = (j.journalType || "").toUpperCase().trim();
    const quartile = (j.journalQuartile || "").toUpperCase().trim();
    const isSCIE = (type === 'SCI' || type === 'SCIE');
    const isScopus = (type === 'SCOPUS');
    const isQ1orQ2 = (quartile === 'Q1' || quartile === 'Q2');
    const isQ3orQ4 = (quartile === 'Q3' || quartile === 'Q4');
    const isESCI = (type === 'ESCI');

    // 2. SCIE and Scopus (Q1 or Q2)
    if (isSCIE && isQ1orQ2) {
        return journalPointsConf["SCIE and Scopus (Q1 or Q2)"] ?? 20;
    }

    // 3. SCIE or Scopus (Q1 or Q2)
    if (isSCIE || (isScopus && isQ1orQ2)) {
        return journalPointsConf["SCIE or Scopus (Q1 or Q2)"] ?? 15;
    }

    // 4. Scopus (Q3 or Q4) or ESCI
    if (isESCI || (isScopus && isQ3orQ4)) {
        return journalPointsConf["Scopus (Q3 or Q4) or ESCI"] ?? 10;
    }

    // Fallback
    return 10;
}

// Default Appraisal Point Configurations
const DEFAULT_CONFIG = {
    teaching: {
        passPercentagePoints: [
            { min: 95, max: 100, points: 20 },
            { min: 85, max: 94.99, points: 15 },
            { min: 75, max: 84.99, points: 10 },
            { min: 70, max: 74.99, points: 5 },
            { min: 0, max: 69.99, points: 0 }
        ],
        feedbackPoints: [
            { min: 95, max: 100, points: 20 },
            { min: 85, max: 94.99, points: 15 },
            { min: 75, max: 84.99, points: 10 },
            { min: 70, max: 74.99, points: 5 },
            { min: 0, max: 69.99, points: 0 }
        ],
        proctoringPoints: [
            { min: 80, max: 100, points: 20 },
            { min: 70, max: 79.99, points: 15 },
            { min: 60, max: 69.99, points: 10 },
            { min: 50, max: 59.99, points: 5 },
            { min: 0, max: 49.99, points: 0 }
        ],
        coAttainmentPoints: {
            5: 20,
            4: 15,
            3: 10,
            2: 5
        }
    },
    research: {
        journalPoints: {
            "IEEE / ASME / ASCE / ACM / FT-50 / Scopus Top 10%": 25,
            "SCIE and Scopus (Q1 or Q2)": 20,
            "SCIE or Scopus (Q1 or Q2)": 15,
            "Scopus (Q3 or Q4) or ESCI": 10
        },
        phdGuidingPoints: {
            pursuing: 2,
            awarded: 20
        },
        bookConferencePoints: {
            isbnBook: 10,
            isbnBookChapter: 5,
            scopusConference: 5,
            maxPoints: 10
        },
        patentPoints: {
            published: 5,
            granted: 20
        },
        novelProductPoints: {
            developed: 10,
            implemented: 20
        },
        projectProposalPoints: {
            shortlisted: 5,
            sanctionedPerLakh: 5
        },
        citationRate: 0.2
    },
    valueAddition: {
        resourceUtilization: {
            organized: 10,
            guestLectureCoordinator: 2,
            resourcePerson: 2,
            participated: 1
        },
        resourceUtilizationPoints: {
            conference: 10,
            sttp: 10,
            fdp: 10,
            guestLecture: 2,
            resourcePerson: 2,
            participated: 1
        },
        resourceUtilizationMaxPoints: 10,
        expertisePoints: {
            memberBOS: 5,
            editorialBoardSCIE: 5,
            editorialBoardESCI: 3,
            awardsGovt: 5,
            awardsOthers: 3,
            developedEContent: 10,
            certificationNewAge: 5,
            hackathonShortlisted: 5,
            newspaperArticle: 3,
            researchFacility: 3,
            nptel12W: 10,
            nptel8W: 8,
            nptel4W: 5,
            coursera: 5,
            grantSanctioned: 5
        },
        expertiseMaxPoints: 10
    },
    administration: {
        maxPoints: 20,
        rolePoints: {
            deanCentral: 20,
            hodCentral: 15,
            hodDept: 15,
            dyHodDept: 10,
            timetableDept: 10,
            placementCentral: 10,
            placementDept: 10,
            courseraCentral: 10,
            courseraDept: 5,
            edcCentral: 10,
            edcDept: 5,
            courseDept: 5,
            websiteCentral: 10,
            nssCentral: 10,
            nssDept: 5,
            trainingCentral: 10,
            trainingDept: 5,
            drcDept: 5,
            antiRaggingCentral: 5,
            antiRaggingDept: 3,
            otherCentral: 10,
            otherDept: 5
        }
    }
};

// 1. Get Appraisal Point Config (UNIPRIME or Default fallback)
exports.getAppraisalConfig = async (req, res) => {
    try {
        const { academicYearId } = req.params;
        let config = await AppraisalConfig.findOne({ academicYearId });
        if (!config) {
            // Return default config but don't save yet
            return res.json({ success: true, data: { academicYearId, ...DEFAULT_CONFIG } });
        }
        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 2. Save/Update Appraisal Point Config (UNIPRIME)
exports.saveAppraisalConfig = async (req, res) => {
    try {
        const { academicYearId, teaching, research, valueAddition, administration } = req.body;
        if (!academicYearId) {
            return res.status(400).json({ success: false, message: "Academic Year ID is required." });
        }

        let config = await AppraisalConfig.findOne({ academicYearId });
        if (config) {
            config.teaching = teaching || config.teaching;
            config.research = research || config.research;
            config.valueAddition = valueAddition || config.valueAddition;
            config.administration = administration || config.administration;
            config.lastUpdatedBy = req.user.userId;
            await config.save();
        } else {
            config = new AppraisalConfig({
                academicYearId,
                teaching,
                research,
                valueAddition,
                administration,
                lastUpdatedBy: req.user.userId
            });
            await config.save();
        }

        res.json({ success: true, data: config });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 3. Initiate or Fetch Faculty Self Appraisal
exports.initiateOrGetAppraisal = async (req, res) => {
    try {
        const { academicYearId } = req.params;
        const facultyId = req.user.userId;

        // Fetch Faculty Info
        const faculty = await Employee.findById(facultyId).populate("department coreDepartment");
        if (!faculty) {
            return res.status(404).json({ success: false, message: "Faculty not found." });
        }

        // Check if there is an active saved Appraisal
        let appraisal = await Appraisal.findOne({ facultyId, academicYearId });

        // If appraisal is already submitted/evaluated, return it as-is
        if (appraisal && appraisal.status !== "Draft") {
            const proctoringEntry = await FacultyProctoringEntry.findOne({ facultyId, academicYear: academicYearId });
            const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId });
            const contributions = await Contribution.find({ facultyId, academicYear: academicYearId });
            const adminRoles = await FacultyAdministration.findOne({ facultyId, academicYear: academicYearId });

            return res.json({ 
                success: true, 
                isCalculatedFresh: false, 
                data: appraisal,
                proctoringDetail: proctoringEntry,
                resourceUtilizationDetails: resourceUt,
                contributionDetails: contributions,
                administrationDetail: adminRoles
            });
        }

        // Fetch configurations for dynamic calculations
        let config = await AppraisalConfig.findOne({ academicYearId });
        if (!config) {
            config = DEFAULT_CONFIG;
        }

        // Check profile completeness for alert flag
        const missingProfileFields = [];
        if (!faculty.scopusId) missingProfileFields.push("Scopus ID");
        if (!faculty.wosId) missingProfileFields.push("Web of Science ID");
        if (!faculty.orcidId) missingProfileFields.push("ORCID ID");
        if (!faculty.designation) missingProfileFields.push("Designation");

        const isProfileComplete = missingProfileFields.length === 0;

        // ==========================================
        // DYNAMIC CALCULATIONS
        // ==========================================

        // --- 1.1 Course Pass Percentage & 1.4 CO Attainment ---
        // Query by faculty's institutionId
        const subjectResults = await FacultySubjectResult.find({
            facultyId: faculty.institutionId,
            academicYearId
        });

        // 1.1 THEORY Courses Pass Percentage Points
        const theoryPP = [];
        let totalPPClaimed = 0;
        
        // 1.4 THEORY Courses CO Attainment Points
        const theoryCO = [];
        let totalCOClaimed = 0;

        subjectResults.forEach(res => {
            if (res.courseType === "THEORY") {
                // PP points
                const ppPoints = getPointsFromRanges(res.passPercentage, config.teaching.passPercentagePoints);
                theoryPP.push({
                    courseName: res.courseName,
                    secBranchSem: `${res.section || ''} - ${res.branch || ''}`,
                    appeared: res.appeared || 0,
                    passed: res.passed || 0,
                    percentage: res.passPercentage || 0,
                    pointsClaimed: ppPoints
                });
                totalPPClaimed += ppPoints;

                // CO points
                const reached = res.noOfCosAttained || 0;
                const coPointsMap = config.teaching.coAttainmentPoints || DEFAULT_CONFIG.teaching.coAttainmentPoints;
                const coPoints = coPointsMap[reached] || 0;
                
                theoryCO.push({
                    courseName: res.courseName,
                    secBranchSem: `${res.section || ''} - ${res.branch || ''}`,
                    noOfCos: res.noOfCos || 0,
                    noOfCosAttained: reached,
                    pointsClaimed: coPoints
                });
                totalCOClaimed += coPoints;
            }
        });

        const ppAverage = theoryPP.length > 0 ? Number((totalPPClaimed / theoryPP.length).toFixed(2)) : 0;
        const coAverage = theoryCO.length > 0 ? Number((totalCOClaimed / theoryCO.length).toFixed(2)) : 0;

        // 1.2 Course Feedback
        const feedbackResults = await FacultyFeedResult.find({
            facultyId: faculty.institutionId,
            academicYearId
        });

        const feedbackItems = [];
        let totalFeedbackClaimed = 0;

        feedbackResults.forEach(res => {
            const feedPoints = getPointsFromRanges(res.percentage || res.overallPercentage, config.teaching.feedbackPoints);
            feedbackItems.push({
                courseName: res.subjectName,
                secBranchSem: `${res.section || ''} - ${res.branch || ''}`,
                noOfStudents: res.totalStudents || 0,
                feedbackPercentage: res.percentage || res.overallPercentage || 0,
                pointsClaimed: feedPoints
            });
            totalFeedbackClaimed += feedPoints;
        });

        const feedbackAverage = feedbackItems.length > 0 ? Number((totalFeedbackClaimed / feedbackItems.length).toFixed(2)) : 0;

        // 1.3 Proctoring Pass Percentage
        const proctoringEntry = await FacultyProctoringEntry.findOne({
            facultyId,
            academicYear: academicYearId
        });

        const proctoringItems = [];
        let totalProctorPoints = 0;

        if (proctoringEntry && (proctoringEntry.status === "Approved" || proctoringEntry.status === "Pending")) {
            const procPoints = getPointsFromRanges(proctoringEntry.passPercentage, config.teaching.proctoringPoints);
            proctoringItems.push({
                totalStudents: proctoringEntry.totalStudents || 0,
                appeared: proctoringEntry.studentsAppeared || 0,
                passed: proctoringEntry.studentsPassed || 0,
                percentage: proctoringEntry.passPercentage || 0,
                pointsClaimed: procPoints
            });
            totalProctorPoints += procPoints;
        }

        const proctoringAverage = proctoringItems.length > 0 ? Number((totalProctorPoints / proctoringItems.length).toFixed(2)) : 0;

        // Sum of all Teaching points (capped at 80)
        const totalTeachingPoints = Math.min(80, Number((ppAverage + feedbackAverage + proctoringAverage + coAverage).toFixed(2)));

        // --- 2. Research Contributions ---
        
        // 2.1 Journals Publication
        const journals = await Journal.find({ facultyId, academicYear: academicYearId, status: "Approved" });
        const researchPapers = [];
        let totalPaperPoints = 0;

        for (const j of journals) {
            // Check if there are other Aditya University co-authors
            const ausCoAuthorsCount = (j.coAuthors || []).filter(c => 
                c.affiliation && c.affiliation.toLowerCase().includes("aditya")
            ).length;

            const isMultiAUSAuthor = ausCoAuthorsCount > 0;
            
            // Check if this specific paper is claimed by someone else in the claims table
            const claim = await AppraisalResearchClaim.findOne({ researchId: j._id });
            
            let points = 0;
            let claimStatus = "unclaimed";
            let claimedBy = null;

            if (claim) {
                if (claim.claimedByFacultyId.toString() === facultyId.toString()) {
                    claimStatus = "claimed_by_me";
                    // Calculate points
                    const basePoints = await getJournalBasePoints(j, config);
                    points = basePoints;
                    const jcrIF = Number(j.jcrImpactFactor || j.impactFactor || 0);
                    if (jcrIF > 0) {
                        points += jcrIF; // Points + JCR IF
                    }
                } else {
                    claimStatus = "claimed_by_other";
                    const claimFaculty = await Employee.findById(claim.claimedByFacultyId).select("name institutionId");
                    claimedBy = claimFaculty ? `${claimFaculty.name} (${claimFaculty.institutionId})` : "Other Faculty";
                    points = 0;
                }
            } else {
                // If it is unclaimed and has NO other Aditya co-authors, auto-claim or calculate
                if (!isMultiAUSAuthor) {
                    const basePoints = await getJournalBasePoints(j, config);
                    points = basePoints;
                    const jcrIF = Number(j.jcrImpactFactor || j.impactFactor || 0);
                    if (jcrIF > 0) {
                        points += jcrIF;
                    }
                    claimStatus = "auto_eligible";
                } else {
                    // Requires manual claim selection because there are multiple AUS co-authors
                    claimStatus = "requires_claim_action";
                    points = 0;
                }
            }

            researchPapers.push({
                paperId: j._id,
                paperType: 'Journal',
                title: j.paperTitle,
                scope: j.journalQuartile,
                doi: j.doi,
                isMultiAUSAuthor,
                claimStatus,
                claimedBy,
                pointsClaimed: Number(points.toFixed(2))
            });
            totalPaperPoints += points;
        }

        // 2.2 Guiding PhD Scholars
        const phdScholars = await PhdScholar.find({ facultyId, academicYear: academicYearId, status: "Approved" });
        const phdItems = [];
        let totalPhdPoints = 0;

        phdScholars.forEach(p => {
            const statusKey = p.scholarStatus ? p.scholarStatus.toLowerCase() : 'pursuing'; // Pursuing vs Awarded
            const pts = config.research.phdGuidingPoints[statusKey] || (statusKey === 'awarded' ? 20 : 2);
            phdItems.push({
                scholarId: p._id,
                name: p.scholarName,
                status: p.scholarStatus,
                pointsClaimed: pts
            });
            totalPhdPoints += pts;
        });

        // 2.3 Books/Chapters & Conferences
        const books = await Textbook.find({ facultyId, academicYear: academicYearId, status: "Approved" });
        const chapters = await BookChapter.find({ facultyId, academicYear: academicYearId, status: "Approved" });
        const conferences = await Conference.find({ facultyId, academicYear: academicYearId, status: "Approved" });

        const bookChapterItems = [];
        let totalBookConfPoints = 0;

        books.forEach(b => {
            const pts = config.research.bookConferencePoints.isbnBook || 10;
            bookChapterItems.push({
                itemId: b._id,
                itemType: 'Textbook',
                title: b.title,
                isbn: b.isbn,
                pointsClaimed: pts
            });
            totalBookConfPoints += pts;
        });

        chapters.forEach(c => {
            const pts = config.research.bookConferencePoints.isbnBookChapter || 5;
            bookChapterItems.push({
                itemId: c._id,
                itemType: 'BookChapter',
                title: c.chapterTitle,
                isbn: c.isbnNumber || c.isbn,
                pointsClaimed: pts
            });
            totalBookConfPoints += pts;
        });

        conferences.forEach(c => {
            const pts = config.research.bookConferencePoints.scopusConference || 5;
            bookChapterItems.push({
                itemId: c._id,
                itemType: 'Conference',
                title: c.paperTitle,
                isbn: c.isbn || "",
                pointsClaimed: pts
            });
            totalBookConfPoints += pts;
        });

        // Capped at config bookConferencePoints.maxPoints (Default: 10)
        const cappedBookConfPoints = Math.min(
            config.research.bookConferencePoints.maxPoints || 10,
            totalBookConfPoints
        );

        // 2.4 Patents Published/Granted
        const patents = await Patent.find({ facultyId, academicYear: academicYearId, status: "Approved" });
        const patentItems = [];
        let totalPatentPoints = 0;

        patents.forEach(p => {
            const statusKey = p.patentStatus ? p.patentStatus.toLowerCase() : 'published'; // Published vs Granted
            const pts = config.research.patentPoints[statusKey] || (statusKey === 'granted' ? 20 : 5);
            patentItems.push({
                patentId: p._id,
                title: p.patentTitle,
                status: p.patentStatus,
                pointsClaimed: pts
            });
            totalPatentPoints += pts;
        });

        // 2.5 Novel products/Technology
        const novelProducts = await NovelProduct.find({ facultyId, academicYear: academicYearId, status: "Approved" });
        const novelItems = [];
        let totalNovelPoints = 0;

        novelProducts.forEach(n => {
            const statusKey = n.productStatus ? n.productStatus.toLowerCase() : 'developed'; // Developed vs Implemented
            const pts = config.research.novelProductPoints[statusKey] || (statusKey === 'implemented' ? 20 : 10);
            novelItems.push({
                productId: n._id,
                title: n.productDetails || n.title,
                status: n.productStatus,
                pointsClaimed: pts
            });
            totalNovelPoints += pts;
        });

        // 2.6 Project / Consultancy
        const fundedProjects = await FundedProject.find({ facultyId, academicYear: academicYearId, status: "Approved" });
        const consultancies = await Consultancy.find({ facultyId, academicYear: academicYearId, status: "Approved" });

        const projectItems = [];
        let totalProjectPoints = 0;

        fundedProjects.forEach(p => {
            const statusKey = p.projectStatus ? p.projectStatus.toLowerCase() : 'shortlisted';
            let pts = 0;
            if (statusKey === 'sanctioned') {
                pts = (p.totalWorth || 0) * (config.research.projectProposalPoints.sanctionedPerLakh || 5);
            } else {
                pts = config.research.projectProposalPoints.shortlisted || 5;
            }
            projectItems.push({
                projectId: p._id,
                projectType: 'FundedProject',
                title: p.projectTitle || p.title,
                agency: p.fundingAgency,
                amountInLakhs: p.totalWorth || 0,
                status: p.projectStatus,
                pointsClaimed: pts
            });
            totalProjectPoints += pts;
        });

        consultancies.forEach(c => {
            const statusKey = c.projectStatus ? c.projectStatus.toLowerCase() : 'shortlisted';
            let pts = 0;
            if (statusKey === 'sanctioned') {
                pts = (c.totalWorth || 0) * (config.research.projectProposalPoints.sanctionedPerLakh || 5);
            } else {
                pts = config.research.projectProposalPoints.shortlisted || 5;
            }
            projectItems.push({
                projectId: c._id,
                projectType: 'Consultancy',
                title: c.projectTitle || c.title,
                agency: c.fundingAgency || c.agency,
                amountInLakhs: c.totalWorth || 0,
                status: c.projectStatus,
                pointsClaimed: pts
            });
            totalProjectPoints += pts;
        });

        // Calculate total research claimed score (citation & h-index are 0 initially or fetched if previously saved)
        const savedCitationPoints = appraisal ? appraisal.research.scopusCitationScore : 0;
        const savedHIndexPoints = appraisal ? appraisal.research.scopusHIndexScore : 0;

        const totalResearchPoints = Number((
            totalPaperPoints + totalPhdPoints + cappedBookConfPoints +
            totalPatentPoints + totalNovelPoints + totalProjectPoints +
            savedCitationPoints + savedHIndexPoints
        ).toFixed(2));

        // --- 3. Extension / Value Addition ---
        
        // 3.1 Faculty resource utilization
        const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId });
        const resUtilItems = [];
        let totalResPoints = 0;

        const resourceUtConf = config.valueAddition?.resourceUtilizationPoints || {
            conference: 10,
            sttp: 10,
            fdp: 10,
            guestLecture: 2,
            resourcePerson: 2,
            participated: 1
        };

        resourceUt.forEach(r => {
            if (r.status === "Approved" || r.status === "Pending at HOD") {
                let pts = 0;
                const activityRole = (r.activityType || '').toLowerCase();
                const activityCat = (r.activityCategory || '').toLowerCase();
                
                if (activityRole.includes('resource person') || activityRole.includes('resourceperson')) {
                    pts = (r.sessionsConducted || 1) * (resourceUtConf.resourcePerson ?? 2);
                } else if (activityRole.includes('participant') || activityRole.includes('participated')) {
                    pts = (r.daysParticipated || 1) * (resourceUtConf.participated ?? 1);
                } else if (activityRole.includes('guest lecture') || activityRole.includes('workshop') || activityRole.includes('event')) {
                    pts = resourceUtConf.guestLecture ?? 2;
                } else {
                    // Organized STTP/FDP/Conference
                    if (activityCat.includes('conference')) {
                        pts = resourceUtConf.conference ?? 10;
                    } else if (activityCat.includes('sttp') || activityCat.includes('refresher')) {
                        pts = resourceUtConf.sttp ?? 10;
                    } else if (activityCat.includes('fdp') || activityCat.includes('symposium')) {
                        pts = resourceUtConf.fdp ?? 10;
                    } else {
                        pts = resourceUtConf.conference ?? 10; // fallback
                    }
                }
                resUtilItems.push({
                    eventId: r._id,
                    event: r.organizationName || "N/A",
                    role: r.activityType || "N/A",
                    pointsClaimed: pts
                });
                totalResPoints += pts;
            }
        });

        // 3.2 Faculty Expertise/Recognition/Contribution
        const contributions = await Contribution.find({ facultyId, academicYear: academicYearId });
        const contItems = [];
        let totalContPoints = 0;

        const expPointsConf = config.valueAddition?.expertisePoints || {
            memberBOS: 5,
            editorialBoardSCIE: 5,
            editorialBoardESCI: 3,
            awardsGovt: 5,
            awardsOthers: 3,
            developedEContent: 10,
            certificationNewAge: 5,
            hackathonShortlisted: 5,
            newspaperArticle: 3,
            researchFacility: 3,
            nptel12W: 10,
            nptel8W: 8,
            nptel4W: 5,
            coursera: 5,
            grantSanctioned: 5
        };

        contributions.forEach(c => {
            if (c.status === "Approved" || c.status === "Pending at HOD") {
                let pts = 5; // default fallback
                let activityName = "Expertise / Recognition Activity";
                
                switch (c.category) {
                    case 1:
                        pts = expPointsConf.memberBOS ?? 5;
                        activityName = "Member of BOG/GB/AC/BOS (Outside AUS)";
                        break;
                    case 2:
                        pts = expPointsConf.editorialBoardSCIE ?? 5;
                        activityName = `Editorial Board Member (SCIE/Q1/Q2) - ${c.journalName || ''}`;
                        break;
                    case 3:
                        pts = expPointsConf.editorialBoardESCI ?? 3;
                        activityName = `Editorial Board Member (ESCI/Q3/Q4/Conf) - ${c.journalName || c.journalConferenceName || ''}`;
                        break;
                    case 4:
                        pts = expPointsConf.awardsGovt ?? 5;
                        activityName = `Awards (MHRD/AICTE/UGC/State Govt/Top 2%) - ${c.awardName || ''}`;
                        break;
                    case 5:
                        pts = expPointsConf.awardsOthers ?? 3;
                        activityName = `Awards (NGO/Trust/Others) - ${c.awardName || ''}`;
                        break;
                    case 6:
                        pts = expPointsConf.developedEContent ?? 10;
                        activityName = `Developed E-Content (Complete Course) - ${c.courseName || ''}`;
                        break;
                    case 7:
                        pts = expPointsConf.certificationNewAge ?? 5;
                        activityName = `Certification on New Age Technologies - ${c.certificationName || ''}`;
                        break;
                    case 8:
                        pts = expPointsConf.hackathonShortlisted ?? 5;
                        activityName = `Student Shortlisted in Hackathon/Startup Finals - ${c.eventName || ''}`;
                        break;
                    case 9:
                        pts = expPointsConf.newspaperArticle ?? 3;
                        activityName = `Magazine/Newspaper Article Published - ${c.articleTitle || ''}`;
                        break;
                    case 10:
                        pts = expPointsConf.researchFacility ?? 3;
                        activityName = `Establishment/Maintenance of Research Facility - ${c.facilityName || ''}`;
                        break;
                    case 11:
                        const dur = (c.duration || '').toLowerCase();
                        if (dur.includes('12')) {
                            pts = expPointsConf.nptel12W ?? 10;
                        } else if (dur.includes('8')) {
                            pts = expPointsConf.nptel8W ?? 8;
                        } else if (dur.includes('4')) {
                            pts = expPointsConf.nptel4W ?? 5;
                        } else {
                            pts = expPointsConf.nptel8W ?? 8; // fallback
                        }
                        activityName = `NPTEL Course Completion (${c.duration || '8 weeks'}) - ${c.courseName || ''}`;
                        break;
                    case 12:
                        pts = expPointsConf.coursera ?? 5;
                        activityName = `Coursera Course Completion - ${c.courseName || ''}`;
                        break;
                    case 13:
                        pts = expPointsConf.grantSanctioned ?? 5;
                        activityName = `FDP/Seminar Grant Sanctioned - ${c.grantName || ''}`;
                        break;
                }

                contItems.push({
                    contributionId: c._id,
                    activityName: activityName,
                    pointsClaimed: pts
                });
                totalContPoints += pts;
            }
        });

        const cappedResPoints = Math.min(config.valueAddition?.resourceUtilizationMaxPoints ?? 10, totalResPoints);
        const cappedContPoints = Math.min(config.valueAddition?.expertiseMaxPoints ?? 10, totalContPoints);
        const totalValueAdditionPoints = Number((cappedResPoints + cappedContPoints).toFixed(2));

        // --- 4. Administrative Responsibilities ---
        const adminRoles = await FacultyAdministration.findOne({ facultyId, academicYear: academicYearId });
        const adminItems = [];
        let totalAdminPoints = 0;

        const adminConf = config.administration?.rolePoints || {
            deanCentral: 20,
            hodCentral: 15,
            hodDept: 15,
            dyHodDept: 10,
            timetableDept: 10,
            placementCentral: 10,
            placementDept: 10,
            courseraCentral: 10,
            courseraDept: 5,
            edcCentral: 10,
            edcDept: 5,
            courseDept: 5,
            websiteCentral: 10,
            nssCentral: 10,
            nssDept: 5,
            trainingCentral: 10,
            trainingDept: 5,
            drcDept: 5,
            antiRaggingCentral: 5,
            antiRaggingDept: 3,
            otherCentral: 10,
            otherDept: 5
        };

        if (adminRoles && adminRoles.roles) {
            adminRoles.roles.forEach(r => {
                if (r.isResponsible && (r.status === "Approved" || r.status === "Pending")) {
                    let pts = 5; // default fallback
                    const name = r.roleName.toLowerCase();
                    const level = (r.level || '').toLowerCase();
                    const isCentral = level.includes('central') || level.includes('institute');
                    
                    if (name.includes('dean') || name.includes('coe')) {
                        pts = adminConf.deanCentral ?? 20;
                    } else if (name.includes('hod')) {
                        if (name.includes('dy') || name.includes('vice')) {
                            pts = adminConf.dyHodDept ?? 10;
                        } else {
                            pts = isCentral ? (adminConf.hodCentral ?? 15) : (adminConf.hodDept ?? 15);
                        }
                    } else if (name.includes('exam cell') || name.includes('exam incharge')) {
                        pts = adminConf.dyHodDept ?? 10;
                    } else if (name.includes('timetable') || name.includes('time table') || name.includes('project') || name.includes('curriculum')) {
                        pts = adminConf.timetableDept ?? 10;
                    } else if (name.includes('placement') || name.includes('internship') || name.includes('alumni')) {
                        pts = isCentral ? (adminConf.placementCentral ?? 10) : (adminConf.placementDept ?? 10);
                    } else if (name.includes('coursera') || name.includes('linkedin') || name.includes('ala')) {
                        pts = isCentral ? (adminConf.courseraCentral ?? 10) : (adminConf.courseraDept ?? 5);
                    } else if (name.includes('edc') || name.includes('iic') || name.includes('iqac')) {
                        pts = isCentral ? (adminConf.edcCentral ?? 10) : (adminConf.edcDept ?? 5);
                    } else if (name.includes('course coordinator')) {
                        pts = adminConf.courseDept ?? 5;
                    } else if (name.includes('website')) {
                        pts = adminConf.websiteCentral ?? 10;
                    } else if (name.includes('nss') || name.includes('professional chapter')) {
                        pts = isCentral ? (adminConf.nssCentral ?? 10) : (adminConf.nssDept ?? 5);
                    } else if (name.includes('training')) {
                        pts = isCentral ? (adminConf.trainingCentral ?? 10) : (adminConf.trainingDept ?? 5);
                    } else if (name.includes('drc') || name.includes('research')) {
                        pts = adminConf.drcDept ?? 5;
                    } else if (name.includes('anti-ragging') || name.includes('antiragging')) {
                        pts = isCentral ? (adminConf.antiRaggingCentral ?? 5) : (adminConf.antiRaggingDept ?? 3);
                    } else {
                        pts = isCentral ? (adminConf.otherCentral ?? 10) : (adminConf.otherDept ?? 5);
                    }

                    adminItems.push({
                        activityName: r.roleName,
                        level: r.level || "Dept level",
                        pointsClaimed: pts
                    });
                    totalAdminPoints += pts;
                }
            });
        }

        const cappedAdminPoints = Math.min(config.administration?.maxPoints ?? 20, totalAdminPoints);

        // Compile updated dynamic snapshot details
        const updatedAppraisalData = {
            facultyId,
            academicYearId,
            status: "Draft",
            personalInfoSnapshot: {
                name: faculty.name,
                institutionId: faculty.institutionId,
                departmentName: faculty.coreDepartment?.name || faculty.department?.name || "N/A",
                designation: faculty.designation || "N/A",
                scopusId: faculty.scopusId || "",
                wosId: faculty.wosId || "",
                orcidId: faculty.orcidId || "",
                dateOfJoining: faculty.createdAt, // fallback or map if doj is there
                qualification: faculty.qualification || "N/A"
            },
            teaching: {
                passPercentage: { courses: theoryPP, averagePoints: ppAverage },
                feedback: { courses: feedbackItems, averagePoints: feedbackAverage },
                proctoring: { entries: proctoringItems, averagePoints: proctoringAverage },
                coAttainment: { courses: theoryCO, averagePoints: coAverage },
                totalClaimed: totalTeachingPoints
            },
            research: {
                papers: { items: researchPapers, totalClaimed: totalPaperPoints },
                phdGuiding: { items: phdItems, totalClaimed: totalPhdPoints },
                booksChapters: { items: bookChapterItems, totalClaimed: cappedBookConfPoints },
                patents: { items: patentItems, totalClaimed: totalPatentPoints },
                novelProducts: { items: novelItems, totalClaimed: totalNovelPoints },
                projectsConsultancies: { items: projectItems, totalClaimed: totalProjectPoints },
                scopusCitationScore: savedCitationPoints,
                scopusHIndexScore: savedHIndexPoints,
                totalClaimed: totalResearchPoints
            },
            valueAddition: {
                resourceUtilization: { items: resUtilItems, totalClaimed: cappedResPoints },
                expertiseContribution: { items: contItems, totalClaimed: cappedContPoints },
                totalClaimed: totalValueAdditionPoints
            },
            administration: {
                items: adminItems,
                totalClaimed: cappedAdminPoints
            }
        };

        // Create or Update Appraisal draft
        if (!appraisal) {
            appraisal = new Appraisal(updatedAppraisalData);
            await appraisal.save();
        } else {
            // Update the draft with the latest live calculations
            Object.assign(appraisal, updatedAppraisalData);
            await appraisal.save();
        }

        res.json({
            success: true,
            isCalculatedFresh: true,
            isProfileComplete,
            missingProfileFields,
            data: appraisal,
            proctoringDetail: proctoringEntry,
            resourceUtilizationDetails: resourceUt,
            contributionDetails: contributions,
            administrationDetail: adminRoles
        });

    } catch (err) {
        console.error("Appraisal Initiation Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// 4. Claim Co-Authored Research Publication (Faculty)
exports.claimResearchPublication = async (req, res) => {
    try {
        const { researchId, researchType, doiOrIsbn, academicYearId } = req.body;
        const facultyId = req.user.userId;

        if (!researchId || !researchType || !doiOrIsbn || !academicYearId) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // Check if there is an active claim
        const existingClaim = await AppraisalResearchClaim.findOne({ researchId });
        if (existingClaim) {
            if (existingClaim.claimedByFacultyId.toString() === facultyId.toString()) {
                return res.status(400).json({ success: false, message: "You have already claimed this publication." });
            }
            const claimant = await Employee.findById(existingClaim.claimedByFacultyId).select("name institutionId");
            return res.status(400).json({ 
                success: false, 
                message: `This publication has already been claimed by ${claimant?.name || 'another faculty member'} (${claimant?.institutionId || ''}).` 
            });
        }

        // Handle Undertaking doc path if uploaded
        let undertakingDoc = "";
        if (req.file) {
            undertakingDoc = `/uploads/undertakings/${req.file.filename}`;
        }

        // Create the claim
        const newClaim = new AppraisalResearchClaim({
            researchId,
            researchType,
            doiOrIsbn,
            academicYearId,
            claimedByFacultyId: facultyId,
            undertakingDoc
        });

        await newClaim.save();
        res.status(201).json({ success: true, message: "Publication claimed successfully.", data: newClaim });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 5. Submit Self Appraisal (Faculty clicks submit -> Locks points snapshot)
exports.submitAppraisal = async (req, res) => {
    try {
        const { academicYearId } = req.body;
        const facultyId = req.user.userId;

        const appraisal = await Appraisal.findOne({ facultyId, academicYearId });
        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal draft not found. Initiate it first." });
        }

        if (appraisal.status !== "Draft" && appraisal.status !== "Rejected by HOD") {
            return res.status(400).json({ success: false, message: "Appraisal has already been submitted." });
        }

        // Lock and submit
        appraisal.status = "Submitted to HOD";
        await appraisal.save();

        res.json({ success: true, message: "Appraisal submitted to HOD successfully.", data: appraisal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 6. HOD Pending list
exports.getPendingHODAppraisals = async (req, res) => {
    try {
        const Employee = require("../employee/employee.model");
        const { getHODDepartments } = require("../../utils/hodHelper");

        const deptIds = await getHODDepartments(req.user);
        
        // Find all faculty in HOD's department
        const facultyIds = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ]
        }).distinct('_id');

        const appraisals = await Appraisal.find({
            facultyId: { $in: facultyIds },
            status: "Submitted to HOD"
        }).populate("facultyId", "name institutionId coreDepartment department").populate("academicYearId", "year");

        const appraisalsWithDetails = [];
        for (const app of appraisals) {
            const facultyId = app.facultyId._id;
            const academicYearId = app.academicYearId._id;

            const proctoringEntry = await FacultyProctoringEntry.findOne({ facultyId, academicYear: academicYearId });
            const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId });
            const contributions = await Contribution.find({ facultyId, academicYear: academicYearId });
            const adminRoles = await FacultyAdministration.findOne({ facultyId, academicYear: academicYearId });

            const appObj = app.toObject();
            appObj.proctoringDetail = proctoringEntry;
            appObj.resourceUtilizationDetails = resourceUt;
            appObj.contributionDetails = contributions;
            appObj.administrationDetail = adminRoles;

            appraisalsWithDetails.push(appObj);
        }

        res.json({ success: true, data: appraisalsWithDetails });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 7. HOD Evaluation Action
exports.evaluateHODAppraisal = async (req, res) => {
    try {
        const { id } = req.params;
        const { interpersonalRatings, comments, action } = req.body; // action can be 'Approve' or 'Reject'

        const appraisal = await Appraisal.findById(id);
        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal not found." });
        }

        if (action === "Reject") {
            appraisal.status = "Rejected by HOD";
            appraisal.hodEvaluation = {
                comments,
                evaluatedBy: req.user.userId,
                evaluationDate: new Date()
            };
            await appraisal.save();
            return res.json({ success: true, message: "Appraisal sent back to faculty.", data: appraisal });
        }

        if (action === "Approve") {
            const facultyId = appraisal.facultyId;
            const academicYearId = appraisal.academicYearId;

            // Check if any entries are Rejected
            const hasRejectedProctoring = await FacultyProctoringEntry.exists({ facultyId, academicYear: academicYearId, status: "Rejected" });
            const hasRejectedResourceUt = await ResourceUtilization.exists({ facultyId, academicYear: academicYearId, status: "Rejected" });
            const hasRejectedContribution = await Contribution.exists({ facultyId, academicYear: academicYearId, status: "Rejected" });
            const hasRejectedAdmin = await FacultyAdministration.exists({ facultyId, academicYear: academicYearId, status: "Rejected" });

            if (hasRejectedProctoring || hasRejectedResourceUt || hasRejectedContribution || hasRejectedAdmin) {
                return res.status(400).json({ success: false, message: "Cannot approve appraisal while there are rejected sections. Please reject the overall appraisal so the faculty can correct them." });
            }

            // Auto-approve any remaining Pending entries
            await FacultyProctoringEntry.updateMany(
                { facultyId, academicYear: academicYearId, status: "Pending" },
                { status: "Approved", approvedBy: req.user.userId, approvalDate: new Date() }
            );
            await ResourceUtilization.updateMany(
                { facultyId, academicYear: academicYearId, status: "Pending at HOD" },
                { status: "Approved", hodComment: "Approved via Appraisal" }
            );
            await Contribution.updateMany(
                { facultyId, academicYear: academicYearId, status: "Pending at HOD" },
                { status: "Approved", hodComment: "Approved via Appraisal" }
            );

            // For administration, update overall status and role statuses
            const adminEntry = await FacultyAdministration.findOne({ facultyId, academicYear: academicYearId });
            if (adminEntry) {
                let modified = false;
                adminEntry.roles.forEach(r => {
                    if (r.isResponsible && r.status === "Pending") {
                        r.status = "Approved";
                        r.approvedBy = req.user.userId;
                        r.approvalDate = new Date();
                        r.remarks = "Approved via Appraisal";
                        modified = true;
                    }
                });
                if (modified) {
                    adminEntry.status = "Approved";
                    adminEntry.approvedBy = req.user.userId;
                    adminEntry.approvalDate = new Date();
                    adminEntry.markModified("roles");
                    await adminEntry.save();
                }
            }
        }

        if (!interpersonalRatings || interpersonalRatings.length !== 10) {
            return res.status(400).json({ success: false, message: "10 Interpersonal Ratings are mandatory." });
        }

        let totalInter = 0;
        interpersonalRatings.forEach(r => {
            totalInter += Number(r.rating) || 0;
        });

        appraisal.hodEvaluation = {
            interpersonalRatings,
            totalInterpersonalPoints: totalInter,
            comments,
            evaluatedBy: req.user.userId,
            evaluationDate: new Date()
        };

        appraisal.status = "Pending Research Admin";
        await appraisal.save();

        res.json({ success: true, message: "Appraisal evaluated by HOD and forwarded to R&D.", data: appraisal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 8. R&D Pending list
exports.getPendingRNDAppraisals = async (req, res) => {
    try {
        const appraisals = await Appraisal.find({
            status: "Pending Research Admin"
        }).populate("facultyId", "name institutionId coreDepartment department").populate("academicYearId", "year");

        res.json({ success: true, data: appraisals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 9. R&D Evaluation Action (Enter Scopus Citations / h-Index points, lock and complete appraisal)
exports.evaluateRNDAppraisal = async (req, res) => {
    try {
        const { id } = req.params;
        const { scopusCitationScore, scopusHIndexScore, comments } = req.body;

        const appraisal = await Appraisal.findById(id);
        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal not found." });
        }

        appraisal.research.scopusCitationScore = Number(scopusCitationScore) || 0;
        appraisal.research.scopusHIndexScore = Number(scopusHIndexScore) || 0;
        
        // Recalculate total research points
        const baseResearch = appraisal.research.papers.totalClaimed + 
                             appraisal.research.phdGuiding.totalClaimed + 
                             appraisal.research.booksChapters.totalClaimed + 
                             appraisal.research.patents.totalClaimed + 
                             appraisal.research.novelProducts.totalClaimed + 
                             appraisal.research.projectsConsultancies.totalClaimed;

        appraisal.research.totalClaimed = Number((baseResearch + appraisal.research.scopusCitationScore + appraisal.research.scopusHIndexScore).toFixed(2));

        appraisal.rndEvaluation = {
            comments,
            evaluatedBy: req.user.userId,
            evaluationDate: new Date()
        };

        appraisal.status = "Completed";
        await appraisal.save();

        res.json({ success: true, message: "Appraisal successfully finalized and completed.", data: appraisal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
