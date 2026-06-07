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
const PhdApplication = require("../PhdScholar/PhdApplication.model");
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

// Helper to determine if a claimant is a PI or Co-PI
function isClaimantEligible(record, claimantInstitutionId) {
    if (record.facultyId && record.facultyId.institutionId === claimantInstitutionId) {
        return record.principalInvestigator === 'Yes' || record.coPrincipalInvestigator === 'Yes';
    }
    const coList = record.coDevelopers || record.coInvestigators || [];
    for (const co of coList) {
        if (co.employeeId && co.employeeId.institutionId === claimantInstitutionId) {
            return co.principalInvestigator === 'Yes' || co.coPrincipalInvestigator === 'Yes';
        }
    }
    return false;
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
        citationRate: 0.2,
        hIndexRateLow: 1,
        hIndexRateMid: 2,
        hIndexRateHigh: 4
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
        const { academicYearId, teaching, research, valueAddition, administration, isActive } = req.body;
        if (!academicYearId) {
            return res.status(400).json({ success: false, message: "Academic Year ID is required." });
        }

        let config = await AppraisalConfig.findOne({ academicYearId });
        if (config) {
            config.teaching = teaching || config.teaching;
            config.research = research || config.research;
            config.valueAddition = valueAddition || config.valueAddition;
            config.administration = administration || config.administration;
            if (isActive !== undefined) {
                config.isActive = isActive;
            }
            config.lastUpdatedBy = req.user.userId;
            await config.save();
        } else {
            config = new AppraisalConfig({
                academicYearId,
                teaching,
                research,
                valueAddition,
                administration,
                isActive: isActive || false,
                lastUpdatedBy: req.user.userId
            });
            await config.save();
        }

        if (config.isActive) {
            await AppraisalConfig.updateMany(
                { _id: { $ne: config._id } },
                { $set: { isActive: false } }
            );
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

        // Check profile completeness for alert flag
        const missingProfileFields = [];
        if (!faculty.scopusId) missingProfileFields.push("Scopus ID");
        if (!faculty.wosId) missingProfileFields.push("Web of Science ID");
        if (!faculty.orcidId) missingProfileFields.push("ORCID ID");
        if (!faculty.designation) missingProfileFields.push("Designation");

        const isProfileComplete = missingProfileFields.length === 0;

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
                administrationDetail: adminRoles,
                faculty: faculty,
                isProfileComplete,
                missingProfileFields
            });
        }

        // Fetch configurations for dynamic calculations
        let config = await AppraisalConfig.findOne({ academicYearId });
        if (!config || !config.isActive) {
            return res.status(403).json({ success: false, message: "Self-appraisal is not active for this academic year." });
        }

        // ==========================================
        // DYNAMIC CALCULATIONS
        // ==========================================

        // --- 1.1 Course Pass Percentage & 1.4 CO Attainment ---
        // Query by faculty's institutionId
        const subjectResults = await FacultySubjectResult.find({
            facultyId: faculty.institutionId,
            academicYearId
        }).populate("branchId", "code");

        // 1.1 THEORY Courses Pass Percentage Points
        const theoryPP = [];
        let totalPPClaimed = 0;
        
        // 1.4 THEORY Courses CO Attainment Points
        const theoryCO = [];
        let totalCOClaimed = 0;

        subjectResults.forEach(res => {
            if (res.courseType === "THEORY") {
                const semDisplay = res.yearNumber ? `YEAR-${res.yearNumber}` : res.semesterNumber ? `SEM-${res.semesterNumber}` : "";
                const branchDisplay = res.branchId?.code || res.branch || "";
                const secDisplay = res.section ? `- SEC ${res.section}` : "";
                const secBranchSem = `${semDisplay} ${branchDisplay} ${secDisplay}`.trim().replace(/\s+/g, ' ');

                // PP points
                const ppPoints = getPointsFromRanges(res.passPercentage, config.teaching.passPercentagePoints);
                theoryPP.push({
                    courseName: res.courseName,
                    secBranchSem: secBranchSem,
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
                    secBranchSem: secBranchSem,
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
        }).populate("branchId", "code");

        const feedbackItems = [];
        let totalFeedbackClaimed = 0;

        feedbackResults.forEach(res => {
            const feedPoints = getPointsFromRanges(res.percentage || res.overallPercentage, config.teaching.feedbackPoints);
            const semDisplay = res.yearNumber ? `YEAR-${res.yearNumber}` : res.semesterNumber ? `SEM-${res.semesterNumber}` : "";
            const branchDisplay = res.branchId?.code || res.branch || "";
            const secDisplay = res.section ? `- SEC ${res.section}` : "";
            const secBranchSem = `${semDisplay} ${branchDisplay} ${secDisplay}`.trim().replace(/\s+/g, ' ');

            feedbackItems.push({
                courseName: res.subjectName,
                secBranchSem: secBranchSem,
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
        const journals = await Journal.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId');

        const researchPapers = [];
        let totalPaperPoints = 0;

        for (const j of journals) {
            const ausCoAuthorsCount = (j.coAuthors || []).filter(c => c.employeeId).length;
            const isMultiAUSAuthor = ausCoAuthorsCount > 0;

            let points = 0;
            let claimStatus = "unclaimed";
            let claimedBy = null;

            if (j.appraisalClaimant) {
                if (j.appraisalClaimant === faculty.institutionId) {
                    claimStatus = "claimed_by_me";
                    const basePoints = await getJournalBasePoints(j, config);
                    points = basePoints;
                    const jcrIF = Number(j.jcrImpactFactor || j.impactFactor || 0);
                    if (jcrIF > 0) {
                        points += jcrIF;
                    }
                } else {
                    claimStatus = "claimed_by_other";
                    const claimFaculty = await Employee.findOne({ institutionId: j.appraisalClaimant }).select("name institutionId");
                    claimedBy = claimFaculty ? `${claimFaculty.name} (${claimFaculty.institutionId})` : "Other Faculty";
                    points = 0;
                }
            } else {
                if (!isMultiAUSAuthor) {
                    claimStatus = "auto_eligible";
                    const basePoints = await getJournalBasePoints(j, config);
                    points = basePoints;
                    const jcrIF = Number(j.jcrImpactFactor || j.impactFactor || 0);
                    if (jcrIF > 0) {
                        points += jcrIF;
                    }
                } else {
                    claimStatus = "requires_claim_action";
                    points = 0;
                }
            }

            // Category/Scope calculation
            let finalCategory = "";
            let isJournalMaster = false;
            if (j.journalName) {
                const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const match = await mongoose.connection.db.collection('journalmasters').findOne({
                    title: { $regex: new RegExp(`^${escapeRegExp(j.journalName.trim())}$`, 'i') }
                });
                if (match) {
                    isJournalMaster = true;
                    finalCategory = match.type || "IEEE / ASME / ASCE / ACM / FT-50 / Scopus Top 10%";
                }
            }
            if (!isJournalMaster) {
                const type = (j.journalType || "").toUpperCase().trim();
                const quartile = (j.journalQuartile || "").toUpperCase().trim();
                if (type && quartile) {
                    finalCategory = `${type} (${quartile})`;
                } else if (type) {
                    finalCategory = type;
                } else if (quartile) {
                    finalCategory = quartile;
                } else {
                    finalCategory = "Journal";
                }
            }

            const jcrIF = Number(j.jcrImpactFactor || j.impactFactor || 0);

            researchPapers.push({
                paperId: j._id,
                paperType: 'Journal',
                title: j.paperTitle,
                scope: finalCategory,
                doi: j.doi,
                isMultiAUSAuthor,
                claimStatus,
                claimedBy,
                pointsClaimed: Number(points.toFixed(2)),
                impactFactor: jcrIF
            });
            totalPaperPoints += points;
        }

        // 2.2 Guiding PhD Scholars
        const phdScholars = await PhdApplication.find({ facultyId, academicYear: academicYearId, status: "Approved" });
        const phdItems = [];
        let totalPhdPoints = 0;

        phdScholars.forEach(p => {
            const statusKey = p.scholarStatus ? p.scholarStatus.toLowerCase() : 'pursuing';
            const pts = config.research.phdGuidingPoints[statusKey] || (statusKey === 'awarded' ? 20 : 2);
            phdItems.push({
                scholarId: p._id,
                name: p.studentName,
                status: p.scholarStatus,
                scholarType: p.scholarType || "Full-Time",
                university: p.university || "Aditya University",
                admissionOrAwardDate: p.admissionOrAwardDate,
                pointsClaimed: pts
            });
            totalPhdPoints += pts;
        });

        // 2.3 Books/Chapters & Conferences
        const books = await Textbook.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'authors.employeeObjectId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId');

        const chapters = await BookChapter.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId');

        const conferences = await Conference.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId');

        const bookChapterItems = [];
        let totalBookConfPoints = 0;

        for (const b of books) {
            let pts = 0;
            if (b.appraisalClaimant && b.appraisalClaimant === faculty.institutionId) {
                pts = config.research.bookConferencePoints.isbnBook || 10;
            }
            bookChapterItems.push({
                itemId: b._id,
                itemType: 'Textbook',
                title: b.title,
                isbn: b.isbn,
                publisher: b.publisher || "N/A",
                pointsClaimed: pts
            });
            totalBookConfPoints += pts;
        }

        for (const c of chapters) {
            let pts = 0;
            if (c.appraisalClaimant && c.appraisalClaimant === faculty.institutionId) {
                pts = config.research.bookConferencePoints.isbnBookChapter || 5;
            }
            bookChapterItems.push({
                itemId: c._id,
                itemType: 'BookChapter',
                title: c.chapterTitle,
                isbn: c.isbnNumber || c.isbn,
                publisher: c.publisher || "N/A",
                pointsClaimed: pts
            });
            totalBookConfPoints += pts;
        }

        for (const c of conferences) {
            let pts = 0;
            if (c.appraisalClaimant && c.appraisalClaimant === faculty.institutionId) {
                pts = config.research.bookConferencePoints.scopusConference || 5;
            }
            bookChapterItems.push({
                itemId: c._id,
                itemType: 'Conference',
                title: c.paperTitle,
                isbn: c.issnIsbn || c.isbn || "N/A",
                publisher: c.organizer || "N/A",
                pointsClaimed: pts
            });
            totalBookConfPoints += pts;
        }

        const cappedBookConfPoints = Math.min(
            config.research.bookConferencePoints.maxPoints || 10,
            totalBookConfPoints
        );

        // 2.4 Patents Published/Granted
        const patents = await Patent.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coInventors.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId');

        const patentItems = [];
        let totalPatentPoints = 0;

        patents.forEach(p => {
            let pts = 0;
            if (p.appraisalClaimant && p.appraisalClaimant === faculty.institutionId) {
                const statusKey = p.patentStatus ? p.patentStatus.toLowerCase() : 'published';
                pts = config.research.patentPoints[statusKey] || (statusKey === 'granted' ? 20 : 5);
            }
            patentItems.push({
                patentId: p._id,
                title: p.patentTitle || p.title,
                status: p.patentStatus,
                filingNo: p.filingNo || "N/A",
                dateOfFiling: p.dateOfFiling,
                country: "India",
                pointsClaimed: pts
            });
            totalPatentPoints += pts;
        });

        // 2.5 Novel products/Technology
        const novelProducts = await NovelProduct.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coDevelopers.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coDevelopers.employeeId', 'name institutionId');

        const novelItems = [];
        let totalNovelPoints = 0;

        for (const n of novelProducts) {
            const ausCoDevelopersCount = (n.coDevelopers || []).filter(c => c.employeeId).length;
            const isMultiAUSAuthor = ausCoDevelopersCount > 0;

            let pts = 0;
            let claimStatus = "unclaimed";
            let claimedBy = null;

            const claimantId = n.appraisalClaimant;
            const isEligible = claimantId ? isClaimantEligible(n, claimantId) : false;

            if (n.appraisalClaimant) {
                if (n.appraisalClaimant === faculty.institutionId) {
                    claimStatus = "claimed_by_me";
                    if (isEligible) {
                        const categoryKey = n.category ? n.category.toLowerCase() : 'developed';
                        pts = config.research.novelProductPoints[categoryKey] || (categoryKey === 'implemented' ? 20 : 10);
                    }
                } else {
                    claimStatus = "claimed_by_other";
                    const claimFaculty = await Employee.findOne({ institutionId: n.appraisalClaimant }).select("name institutionId");
                    claimedBy = claimFaculty ? `${claimFaculty.name} (${claimFaculty.institutionId})` : "Other Faculty";
                    pts = 0;
                }
            } else {
                if (!isMultiAUSAuthor) {
                    claimStatus = "auto_eligible";
                    if (isClaimantEligible(n, faculty.institutionId)) {
                        const categoryKey = n.category ? n.category.toLowerCase() : 'developed';
                        pts = config.research.novelProductPoints[categoryKey] || (categoryKey === 'implemented' ? 20 : 10);
                    }
                } else {
                    claimStatus = "requires_claim_action";
                    pts = 0;
                }
            }

            novelItems.push({
                productId: n._id,
                title: n.productName,
                status: n.category || 'Developed',
                organizationName: n.organizationName || "N/A",
                isMultiAUSAuthor,
                claimStatus,
                claimedBy,
                pointsClaimed: Number(pts.toFixed(2))
            });
            totalNovelPoints += pts;
        }

        // 2.6 Project / Consultancy
        const fundedProjects = await FundedProject.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coInvestigators.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coInvestigators.employeeId', 'name institutionId');

        const consultancies = await Consultancy.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coInvestigators.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coInvestigators.employeeId', 'name institutionId');

        const projectItems = [];
        let totalProjectPoints = 0;

        for (const p of fundedProjects) {
            let pts = 0;
            const ausCoInvestigatorsCount = (p.coInvestigators || []).filter(c => c.employeeId).length;
            const isMultiAUSAuthor = ausCoInvestigatorsCount > 0;

            let claimStatus = "unclaimed";
            let claimedBy = null;

            const claimantId = p.appraisalClaimant;
            const isEligible = claimantId ? isClaimantEligible(p, claimantId) : false;

            if (p.appraisalClaimant) {
                if (p.appraisalClaimant === faculty.institutionId) {
                    claimStatus = "claimed_by_me";
                    if (p.applyingSeedGrant !== "Yes" && isEligible) {
                        const statusKey = p.projectStatus ? p.projectStatus.toLowerCase() : 'sanctioned';
                        if (statusKey === 'sanctioned') {
                            const amountInLakhs = parseFloat(p.sanctionedAmount) || 0;
                            pts = amountInLakhs * (config.research.projectProposalPoints.sanctionedPerLakh || 5);
                        } else {
                            pts = config.research.projectProposalPoints.shortlisted || 5;
                        }
                    }
                } else {
                    claimStatus = "claimed_by_other";
                    const claimFaculty = await Employee.findOne({ institutionId: p.appraisalClaimant }).select("name institutionId");
                    claimedBy = claimFaculty ? `${claimFaculty.name} (${claimFaculty.institutionId})` : "Other Faculty";
                    pts = 0;
                }
            } else {
                if (!isMultiAUSAuthor) {
                    claimStatus = "auto_eligible";
                    if (p.applyingSeedGrant !== "Yes" && isClaimantEligible(p, faculty.institutionId)) {
                        const statusKey = p.projectStatus ? p.projectStatus.toLowerCase() : 'sanctioned';
                        if (statusKey === 'sanctioned') {
                            const amountInLakhs = parseFloat(p.sanctionedAmount) || 0;
                            pts = amountInLakhs * (config.research.projectProposalPoints.sanctionedPerLakh || 5);
                        } else {
                            pts = config.research.projectProposalPoints.shortlisted || 5;
                        }
                    }
                } else {
                    claimStatus = "requires_claim_action";
                    pts = 0;
                }
            }

            projectItems.push({
                projectId: p._id,
                projectType: 'FundedProject',
                title: p.title,
                agency: p.fundingAgency,
                amountInLakhs: parseFloat(p.sanctionedAmount) || 0,
                status: p.projectStatus || 'Sanctioned',
                isMultiAUSAuthor,
                claimStatus,
                claimedBy,
                pointsClaimed: Number(pts.toFixed(2))
            });
            totalProjectPoints += pts;
        }

        for (const c of consultancies) {
            let pts = 0;
            const ausCoInvestigatorsCount = (c.coInvestigators || []).filter(co => co.employeeId).length;
            const isMultiAUSAuthor = ausCoInvestigatorsCount > 0;

            let claimStatus = "unclaimed";
            let claimedBy = null;

            const claimantId = c.appraisalClaimant;
            const isEligible = claimantId ? isClaimantEligible(c, claimantId) : false;

            if (c.appraisalClaimant) {
                if (c.appraisalClaimant === faculty.institutionId) {
                    claimStatus = "claimed_by_me";
                    if (c.applyingSeedGrant !== "Yes" && isEligible) {
                        const statusKey = c.projectStatus ? c.projectStatus.toLowerCase() : 'sanctioned';
                        if (statusKey === 'sanctioned') {
                            const amountInLakhs = parseFloat(c.amount) || 0;
                            pts = amountInLakhs * (config.research.projectProposalPoints.sanctionedPerLakh || 5);
                        } else {
                            pts = config.research.projectProposalPoints.shortlisted || 5;
                        }
                    }
                } else {
                    claimStatus = "claimed_by_other";
                    const claimFaculty = await Employee.findOne({ institutionId: c.appraisalClaimant }).select("name institutionId");
                    claimedBy = claimFaculty ? `${claimFaculty.name} (${claimFaculty.institutionId})` : "Other Faculty";
                    pts = 0;
                }
            } else {
                if (!isMultiAUSAuthor) {
                    claimStatus = "auto_eligible";
                    if (c.applyingSeedGrant !== "Yes" && isClaimantEligible(c, faculty.institutionId)) {
                        const statusKey = c.projectStatus ? c.projectStatus.toLowerCase() : 'sanctioned';
                        if (statusKey === 'sanctioned') {
                            const amountInLakhs = parseFloat(c.amount) || 0;
                            pts = amountInLakhs * (config.research.projectProposalPoints.sanctionedPerLakh || 5);
                        } else {
                            pts = config.research.projectProposalPoints.shortlisted || 5;
                        }
                    }
                } else {
                    claimStatus = "requires_claim_action";
                    pts = 0;
                }
            }

            projectItems.push({
                projectId: c._id,
                projectType: 'Consultancy',
                title: c.title,
                agency: c.organization,
                amountInLakhs: parseFloat(c.amount) || 0,
                status: c.projectStatus || 'Sanctioned',
                isMultiAUSAuthor,
                claimStatus,
                claimedBy,
                pointsClaimed: Number(pts.toFixed(2))
            });
            totalProjectPoints += pts;
        }

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
            administrationDetail: adminRoles,
            faculty: faculty
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

        const config = await AppraisalConfig.findOne({ academicYearId });
        if (!config || !config.isActive) {
            return res.status(403).json({ success: false, message: "Self-appraisal is not active for this academic year." });
        }

        const appraisal = await Appraisal.findOne({ facultyId, academicYearId });
        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal draft not found. Initiate it first." });
        }

        if (appraisal.status !== "Draft" && appraisal.status !== "Rejected by HOD") {
            return res.status(400).json({ success: false, message: "Appraisal has already been submitted." });
        }

        // Retrieve faculty information for category check
        const faculty = await Employee.findById(facultyId);
        if (!faculty) {
            return res.status(404).json({ success: false, message: "Faculty profile not found." });
        }

        // Determine thresholds based on category
        const doc = (faculty.doctorate || "").toLowerCase().trim();
        const lead = (faculty.leadership || "").toLowerCase().trim();
        let minMetric21 = 30;
        if (doc === "yes" && lead === "no") {
            minMetric21 = 40;
        }

        // Validate Condition 1: FDP / NPTEL / Coursera course completion
        const allowedOrg = [
            "ugc", "aicte", "iit", "iim", "nit", "mhrd r&d lab", "mhrd r&d labs",
            "nitttr", "niper", "icmr", "nirf ranked institute (below 200)",
            "nirf ranked institute (below rank 200)", "govt. university", "government university", "nptel"
        ];

        // 1. Check FDP in Resource Utilization
        const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId, status: { $ne: "Rejected" } });
        const hasValidFdp = resourceUt.some(r => {
            const cat = (r.activityCategory || '').toLowerCase().trim();
            const type = (r.activityType || '').toLowerCase().trim();
            const org = (r.organizingInstitutionCategory || '').toLowerCase().trim();
            const days = Number(r.daysParticipated) || Number(r.duration) || 0;
            return cat === 'fdp' && type === 'fdp participant' && days >= 5 && allowedOrg.includes(org);
        });

        // 2. Check NPTEL/Coursera in Contributions
        const contributions = await Contribution.find({ facultyId, academicYear: academicYearId, status: { $ne: "Rejected" } });
        const hasValidNptelOrCoursera = contributions.some(c => {
            const cat = parseInt(c.category);
            return cat === 11 || cat === 12;
        });

        if (!hasValidFdp && !hasValidNptelOrCoursera) {
            return res.status(400).json({
                success: false,
                message: "Appraisal submission blocked: Faculty must satisfy the FDP / Coursera / NPTEL requirement."
            });
        }

        // Validate Condition 2: Metric 2.1 Score
        const metric21Score = appraisal.research?.papers?.totalClaimed || 0;
        if (metric21Score < minMetric21) {
            return res.status(400).json({
                success: false,
                message: `Appraisal submission blocked: Minimum Metric 2.1 (Paper Publication) score of ${minMetric21} is required (Current: ${metric21Score}).`
            });
        }

        // Update all Draft entries for ResourceUtilization and Contribution to Pending at HOD
        await ResourceUtilization.updateMany(
            { facultyId, academicYear: academicYearId, status: "Draft" },
            { status: "Pending at HOD" }
        );
        await Contribution.updateMany(
            { facultyId, academicYear: academicYearId, status: "Draft" },
            { status: "Pending at HOD" }
        );

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
            status: { $in: ["Submitted to HOD", "Rejected by HOD", "Pending Research Admin", "Completed"] }
        }).populate("facultyId", "name institutionId coreDepartment department doctorate leadership").populate("academicYearId", "year");

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

            // Revert all Pending at HOD and Rejected entries back to Draft
            await ResourceUtilization.updateMany(
                { facultyId: appraisal.facultyId, academicYear: appraisal.academicYearId, status: { $in: ["Pending at HOD", "Rejected"] } },
                { status: "Draft" }
            );
            await Contribution.updateMany(
                { facultyId: appraisal.facultyId, academicYear: appraisal.academicYearId, status: { $in: ["Pending at HOD", "Rejected"] } },
                { status: "Draft" }
            );

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
        }).populate("facultyId", "name institutionId coreDepartment department designation qualification email phone profileImage college").populate("academicYearId", "year");

        res.json({ success: true, data: appraisals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 9. R&D Evaluation Action (Enter Scopus Citations / h-Index points, lock and complete appraisal)
exports.evaluateRNDAppraisal = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            scopusCitations, 
            hIndex2024, 
            hIndex2025, 
            scopusCitationScore, 
            scopusHIndexScore, 
            comments, 
            isDraft 
        } = req.body;

        const appraisal = await Appraisal.findById(id);
        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal not found." });
        }

        if (scopusCitations !== undefined) appraisal.research.scopusCitations = Number(scopusCitations) || 0;
        if (hIndex2024 !== undefined) appraisal.research.hIndex2024 = Number(hIndex2024) || 0;
        if (hIndex2025 !== undefined) appraisal.research.hIndex2025 = Number(hIndex2025) || 0;
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

        if (isDraft) {
            appraisal.status = "Pending Research Admin";
        } else {
            appraisal.status = "Completed";
        }

        await appraisal.save();

        res.json({ 
            success: true, 
            message: isDraft ? "Appraisal draft saved successfully." : "Appraisal successfully finalized and completed.", 
            data: appraisal 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get unresolved research claims for gatekeeper check
// @route   GET /api/appraisal/unresolved-claims/:academicYearId
// @access  Private (Faculty)
exports.getUnresolvedClaims = async (req, res) => {
    try {
        const { academicYearId } = req.params;
        const facultyId = req.user.userId;

        const unresolved = [];

        // 1. Journals
        const journals = await Journal.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coAuthors.employeeId', 'name institutionId');

        for (const j of journals) {
            const ausCoAuthors = j.coAuthors.filter(c => c.employeeId);
            if (ausCoAuthors.length > 0) {
                const claimants = [
                    { _id: j.facultyId._id, name: j.facultyId.name, institutionId: j.facultyId.institutionId },
                    ...ausCoAuthors.map(c => ({ _id: c.employeeId._id, name: c.employeeId.name, institutionId: c.employeeId.institutionId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t._id.toString() === v._id.toString()) === i);

                unresolved.push({
                    _id: j._id,
                    type: 'Journal',
                    title: j.paperTitle,
                    info: `Journal: ${j.journalName}`,
                    applicant: j.facultyId,
                    isApplicant: j.facultyId._id.toString() === facultyId.toString(),
                    eligibleClaimants: uniqueClaimants
                });
            }
        }

        // 2. Patents
        const patents = await Patent.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coInventors.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coInventors.employeeId', 'name institutionId');

        for (const p of patents) {
            const ausCoInventors = p.coInventors.filter(c => c.employeeId);
            if (ausCoInventors.length > 0) {
                const claimants = [
                    { _id: p.facultyId._id, name: p.facultyId.name, institutionId: p.facultyId.institutionId },
                    ...ausCoInventors.map(c => ({ _id: c.employeeId._id, name: c.employeeId.name, institutionId: c.employeeId.institutionId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t._id.toString() === v._id.toString()) === i);

                unresolved.push({
                    _id: p._id,
                    type: 'Patent',
                    title: p.title,
                    info: `Patent Name: ${p.patentName} (Filing No: ${p.filingNo})`,
                    applicant: p.facultyId,
                    isApplicant: p.facultyId._id.toString() === facultyId.toString(),
                    eligibleClaimants: uniqueClaimants
                });
            }
        }

        // 3. Book Chapters
        const chapters = await BookChapter.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coAuthors.employeeId', 'name institutionId');

        for (const c of chapters) {
            const ausCoAuthors = c.coAuthors.filter(co => co.employeeId);
            if (ausCoAuthors.length > 0) {
                const claimants = [
                    { _id: c.facultyId._id, name: c.facultyId.name, institutionId: c.facultyId.institutionId },
                    ...ausCoAuthors.map(co => ({ _id: co.employeeId._id, name: co.employeeId.name, institutionId: co.employeeId.institutionId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t._id.toString() === v._id.toString()) === i);

                unresolved.push({
                    _id: c._id,
                    type: 'BookChapter',
                    title: c.chapterTitle,
                    info: `Book: ${c.textBookName}`,
                    applicant: c.facultyId,
                    isApplicant: c.facultyId._id.toString() === facultyId.toString(),
                    eligibleClaimants: uniqueClaimants
                });
            }
        }

        // 4. Textbooks
        const textbooks = await Textbook.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'authors.employeeObjectId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('authors.employeeObjectId', 'name institutionId');

        for (const tb of textbooks) {
            const ausAuthors = tb.authors.filter(a => a.employeeObjectId);
            if (ausAuthors.length > 1) {
                const claimants = [
                    { _id: tb.facultyId._id, name: tb.facultyId.name, institutionId: tb.facultyId.institutionId },
                    ...ausAuthors.map(a => ({ _id: a.employeeObjectId._id, name: a.employeeObjectId.name, institutionId: a.employeeObjectId.institutionId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t._id.toString() === v._id.toString()) === i);

                unresolved.push({
                    _id: tb._id,
                    type: 'Textbook',
                    title: tb.title,
                    info: `ISBN: ${tb.isbn}`,
                    applicant: tb.facultyId,
                    isApplicant: tb.facultyId._id.toString() === facultyId.toString(),
                    eligibleClaimants: uniqueClaimants
                });
            }
        }

        // 5. Conferences
        const conferences = await Conference.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coAuthors.employeeId', 'name institutionId');

        for (const conf of conferences) {
            const ausCoAuthors = conf.coAuthors.filter(co => co.employeeId);
            if (ausCoAuthors.length > 0) {
                const claimants = [
                    { _id: conf.facultyId._id, name: conf.facultyId.name, institutionId: conf.facultyId.institutionId },
                    ...ausCoAuthors.map(co => ({ _id: co.employeeId._id, name: co.employeeId.name, institutionId: co.employeeId.institutionId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t._id.toString() === v._id.toString()) === i);

                unresolved.push({
                    _id: conf._id,
                    type: 'Conference',
                    title: conf.title,
                    info: `Conference: ${conf.conferenceName}`,
                    applicant: conf.facultyId,
                    isApplicant: conf.facultyId._id.toString() === facultyId.toString(),
                    eligibleClaimants: uniqueClaimants
                });
            }
        }

        // 6. Funded Projects
        const projects = await FundedProject.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coInvestigators.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coInvestigators.employeeId', 'name institutionId');

        for (const proj of projects) {
            const ausCoInvestigators = proj.coInvestigators.filter(c => c.employeeId);
            if (ausCoInvestigators.length > 0) {
                const claimants = [
                    { _id: proj.facultyId._id, name: proj.facultyId.name, institutionId: proj.facultyId.institutionId },
                    ...ausCoInvestigators.map(c => ({ _id: c.employeeId._id, name: c.employeeId.name, institutionId: c.employeeId.institutionId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t._id.toString() === v._id.toString()) === i);

                unresolved.push({
                    _id: proj._id,
                    type: 'FundedProject',
                    title: proj.title,
                    info: `Agency: ${proj.fundingAgency} (Amount: ${proj.sanctionedAmount})`,
                    applicant: proj.facultyId,
                    isApplicant: proj.facultyId._id.toString() === facultyId.toString(),
                    eligibleClaimants: uniqueClaimants
                });
            }
        }

        // 7. Consultancy
        const consultancies = await Consultancy.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coInvestigators.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coInvestigators.employeeId', 'name institutionId');

        for (const c of consultancies) {
            const ausCoInvestigators = c.coInvestigators.filter(co => co.employeeId);
            if (ausCoInvestigators.length > 0) {
                const claimants = [
                    { _id: c.facultyId._id, name: c.facultyId.name, institutionId: c.facultyId.institutionId },
                    ...ausCoInvestigators.map(co => ({ _id: co.employeeId._id, name: co.employeeId.name, institutionId: co.employeeId.institutionId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t._id.toString() === v._id.toString()) === i);

                unresolved.push({
                    _id: c._id,
                    type: 'Consultancy',
                    title: c.title,
                    info: `Organization: ${c.organization} (Amount: ${c.amount})`,
                    applicant: c.facultyId,
                    isApplicant: c.facultyId._id.toString() === facultyId.toString(),
                    eligibleClaimants: uniqueClaimants
                });
            }
        }

        // 8. Novel Product
        const novelProducts = await NovelProduct.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coDevelopers.employeeId': facultyId }
            ]
        }).populate('facultyId', 'name institutionId').populate('coDevelopers.employeeId', 'name institutionId');

        for (const n of novelProducts) {
            const ausCoDevelopers = n.coDevelopers.filter(cd => cd.employeeId);
            if (ausCoDevelopers.length > 0) {
                const claimants = [
                    { _id: n.facultyId._id, name: n.facultyId.name, institutionId: n.facultyId.institutionId },
                    ...ausCoDevelopers.map(cd => ({ _id: cd.employeeId._id, name: cd.employeeId.name, institutionId: cd.employeeId.institutionId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t._id.toString() === v._id.toString()) === i);

                unresolved.push({
                    _id: n._id,
                    type: 'NovelProduct',
                    title: n.productName,
                    info: `Category: ${n.category} (Org: ${n.organizationName || 'N/A'})`,
                    applicant: n.facultyId,
                    isApplicant: n.facultyId._id.toString() === facultyId.toString(),
                    eligibleClaimants: uniqueClaimants
                });
            }
        }

        res.json({ success: true, count: unresolved.length, data: unresolved });
    } catch (err) {
        console.error("Get Unresolved Claims Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Resolve a research claim by selecting a claimant
// @route   POST /api/appraisal/resolve-claim
// @access  Private (Faculty - Applicant only)
exports.resolveClaim = async (req, res) => {
    try {
        const { researchId, researchType, claimantId } = req.body;
        const facultyId = req.user.userId;

        if (!researchId || !researchType || !claimantId) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        let model;
        switch (researchType) {
            case 'Journal':
                model = Journal;
                break;
            case 'Conference':
                model = Conference;
                break;
            case 'BookChapter':
                model = BookChapter;
                break;
            case 'Textbook':
                model = Textbook;
                break;
            case 'Patent':
                model = Patent;
                break;
            case 'FundedProject':
                model = FundedProject;
                break;
            case 'Consultancy':
                model = Consultancy;
                break;
            case 'NovelProduct':
                model = NovelProduct;
                break;
            default:
                return res.status(400).json({ success: false, message: "Invalid research type." });
        }

        const record = await model.findById(researchId);
        if (!record) {
            return res.status(404).json({ success: false, message: "Publication record not found." });
        }

        if (record.facultyId.toString() !== facultyId.toString()) {
            return res.status(403).json({ success: false, message: "Only the applicant can designate the appraisal claimant." });
        }

        const employee = await Employee.findOne({
            $or: [
                { _id: mongoose.isValidObjectId(claimantId) ? claimantId : null },
                { institutionId: claimantId }
            ]
        });
        if (!employee) {
            return res.status(404).json({ success: false, message: "Claimant employee not found." });
        }

        record.appraisalClaimant = employee.institutionId;
        if (record.status === 'Approved' && (record.applyIncentive === 'Yes' || record.applyIncentive === 'yes')) {
            record.incentiveClaimant = employee.institutionId;
        }
        await record.save();

        res.json({ success: true, message: "Claimant updated successfully.", data: record });
    } catch (err) {
        console.error("Resolve Claim Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
