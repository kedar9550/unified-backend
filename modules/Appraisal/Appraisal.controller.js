const mongoose = require("mongoose");
const puppeteer = require("puppeteer");
const Appraisal = require("./Appraisal.model.js");
const AppraisalConfig = require("./AppraisalConfig.model");
const AppraisalResearchClaim = require("./AppraisalResearchClaim.model");
const { ADMIN_ROLE_CATALOG } = require("../FacultyAdministration/adminRoleCatalog");

// Import all related models
const Employee = require("../employee/employee.model");

const getFacultyCategoryHelper = (fac) => {
    if (!fac) return "Non-Doctorate Faculty";
    const lead = (fac.leadership || "").toLowerCase().trim();
    const doct = (fac.doctorate || "").toLowerCase().trim();

    if (lead === "yes" || lead === "true") return "Leadership Team";

    let hasPhd = false;
    if (fac.qualifications && Array.isArray(fac.qualifications)) {
        hasPhd = fac.qualifications.some(q =>
            q.level === "Doctoral" ||
            (q.qualification || "").toLowerCase().trim().includes("phd") ||
            (q.qualification || "").toLowerCase().trim().includes("ph.d")
        );
    } else if (fac.qualification) {
        const qual = fac.qualification.toLowerCase().trim();
        hasPhd = qual.includes("phd") || qual.includes("ph.d");
    }

    if (hasPhd || doct === "yes" || doct === "true") return "Doctorate Faculty";
    return "Non-Doctorate Faculty";
};

const attachEligibilityInfo = (appraisalObj, config) => {
    if (!appraisalObj || !appraisalObj.facultyId) {
        if (appraisalObj) appraisalObj.eligibility = { type: 'N/A', mins: {}, status: 'Unfulfilled' };
        return appraisalObj;
    }

    const type = getFacultyCategoryHelper(appraisalObj.facultyId);
    let mins = {};
    if (config && config.minimumPoints && config.minimumPoints[type]) {
        // Deep copy to avoid mutating the config
        mins = JSON.parse(JSON.stringify(config.minimumPoints[type]));
    }

    // Adjust minimums for those without COs
    const hasCos = appraisalObj.personalInfoSnapshot?.hasCos !== false; // defaults to true
    if (!hasCos) {
        if (type === "Leadership Team") {
            mins.teaching = 30;
        } else {
            mins.teaching = 38;
        }
        // Total drops by 20 because max teaching drops from 80 to 60
        mins.total = (mins.total || 0) - 20;
    }

    const minPoints = mins.total || 0;

    const disallowedOrg = ["other / host institute", "other", "host institute"];

    let hasFDP = false;

    // 1. Check FDP in Resource Utilization (3.1)
    const resourceItems = appraisalObj.resourceUtilizationDetails ||
        (appraisalObj.valueAddition && appraisalObj.valueAddition.resourceUtilization?.items?.map(i => i.eventId)) ||
        [];

    for (const event of resourceItems) {
        if (event && event.status !== "Rejected") {
            const cat = (event.activityCategory || '').toLowerCase().trim();
            const evType = (event.activityType || '').toLowerCase().trim();
            const org = (event.organizingInstitutionCategory || '').toLowerCase().trim();
            const days = Number(event.numberOfDaysParticipated) || Number(event.daysParticipated) || Number(event.duration) || 0;

            if (cat === 'fdp' && evType === 'fdp participant' && days >= 5 && !disallowedOrg.includes(org)) {
                if (org.includes("nirf")) {
                    const rank = Number(event.nirfRank);
                    if (!isNaN(rank) && rank > 0 && rank < 200) {
                        hasFDP = true;
                        break;
                    }
                } else {
                    hasFDP = true;
                    break;
                }
            }
        }
    }

    // 2. Check Coursera 40hrs in Expertise Contribution (3.2)
    if (!hasFDP) {
        const contributionItems = appraisalObj.contributionDetails ||
            (appraisalObj.valueAddition && appraisalObj.valueAddition.expertiseContribution?.items?.map(i => i.contributionId)) ||
            [];

        for (const contribution of contributionItems) {
            if (contribution && contribution.category && contribution.status !== "Rejected") {
                const catCode = typeof contribution.category === 'object' ? contribution.category?.code : parseInt(contribution.category);

                // Assuming Category 12 is Coursera, fallback to name matching if code not present
                const catName = (contribution.category.name || '').toLowerCase();
                if ((catCode === 12 || catName.includes('coursera')) && Number(contribution.courseHours) >= 40) {
                    hasFDP = true;
                    break;
                }
            }
        }
    }

    const r21Obtained = appraisalObj.research?.papers?.totalClaimed || 0;
    const r21Min = mins.research21 || 0;
    const iRaw = appraisalObj.hodEvaluation?.totalInterpersonalPoints || 0;

    let isFulfilled = true;
    if (!hasFDP) isFulfilled = false;
    if (r21Obtained < r21Min) isFulfilled = false;

    // In previous frontend it was checked >= 30, but usually it's checked against min config. Let's use >= 30 for consistency with old code or check against mins.interpersonalSkills if exists.
    const iRawMin = mins.interpersonalSkills || 30;
    if (iRaw < iRawMin) isFulfilled = false;

    const teachingObtained = appraisalObj.teaching?.totalClaimed || 0;
    const researchObtained = appraisalObj.research?.totalClaimed || 0;
    const v31 = appraisalObj.valueAddition?.resourceUtilization?.totalClaimed || 0;
    const v32 = appraisalObj.valueAddition?.expertiseContribution?.totalClaimed || 0;
    const v3Obtained = v31 + v32;
    const aRaw = appraisalObj.administration?.totalClaimed || 0;

    const sum1to4 = teachingObtained + researchObtained + v3Obtained + aRaw;
    const max1to4 = hasCos ? 200 : 180;
    const capped1to4 = Math.min(max1to4, sum1to4);

    // Attach capped 1-4 total to object so UI and Excel can use it if needed
    appraisalObj.cappedTotal1to4 = capped1to4;

    const grandTotal = parseFloat((capped1to4 + iRaw).toFixed(2));

    if (grandTotal < minPoints) isFulfilled = false;

    appraisalObj.eligibility = {
        type,
        mins,
        status: isFulfilled ? "Fulfilled" : "Unfulfilled",
        details: {
            fdpStatus: hasFDP ? "Fulfilled" : "Unfulfilled",
            r21Status: (r21Obtained >= r21Min) ? "Fulfilled" : "Unfulfilled",
            interpersonalStatus: (iRaw >= iRawMin) ? "Fulfilled" : "Unfulfilled"
        },
        totalObtained: grandTotal
    };

    return appraisalObj;
};
const AcademicYear = require("../academicYear/academicYear.model");
const Department = require("../academics/department.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
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
        const searchName = j.journalName.trim().toUpperCase();
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = await mongoose.connection.db.collection('journalmasters').findOne({
            journalTitle: new RegExp(`^${escapeRegExp(searchName)}$`)
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
    return 0;
}

// Helper to determine if a claimant is a PI or Co-PI
function isClaimantEligible(record, claimantInstitutionId) {
    if (record.facultyId && record.facultyId.institutionId === claimantInstitutionId) {
        return record.principalInvestigator === 'Yes' || record.coPrincipalInvestigator === 'Yes';
    }
    const coList = record.coDevelopers || record.coInvestigators || [];
    for (const co of coList) {
        if (co.employeeId && co.employeeId === claimantInstitutionId) {
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

// 1. Get Active Appraisal Year (from active config)
exports.getActiveAppraisalYear = async (req, res) => {
    try {
        const config = await AppraisalConfig.findOne({ isActive: true }).populate("academicYearId");
        if (!config) {
            return res.status(404).json({ success: false, message: "No active appraisal year configuration found." });
        }
        res.json({ success: true, data: config.academicYearId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 2. Get Appraisal Point Config (UNIPRIME or Default fallback)
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
        const { academicYearId, teaching, research, valueAddition, administration, minimumPoints, isActive, cutoffDate } = req.body;
        if (!academicYearId) {
            return res.status(400).json({ success: false, message: "Academic Year ID is required." });
        }

        let config = await AppraisalConfig.findOne({ academicYearId });
        if (config) {
            config.teaching = teaching || config.teaching;
            config.research = research || config.research;
            config.valueAddition = valueAddition || config.valueAddition;
            config.administration = administration || config.administration;
            if (minimumPoints) config.minimumPoints = minimumPoints;
            if (isActive !== undefined) {
                config.isActive = isActive;
            }
            if (cutoffDate !== undefined) {
                config.cutoffDate = cutoffDate;
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
                minimumPoints: minimumPoints || {},
                isActive: isActive || false,
                cutoffDate: cutoffDate || null,
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
        const faculty = await Employee.findById(facultyId).populate({
            path: "department",
            populate: { path: "schoolIds" }
        }).populate("coreDepartment");
        if (!faculty) {
            return res.status(404).json({ success: false, message: "Faculty not found." });
        }

        // Fetch configurations for dynamic calculations and checks
        let config = await AppraisalConfig.findOne({ academicYearId });
        if (!config || !config.isActive) {
            return res.status(403).json({ success: false, message: "Self-appraisal is not active for this academic year." });
        }

        // Cutoff Date Check
        if (config.cutoffDate && faculty.dateOfJoining) {
            const doj = new Date(faculty.dateOfJoining);
            const cutoff = new Date(config.cutoffDate);
            if (doj > cutoff) {
                return res.status(403).json({ success: false, message: "You are not eligible for appraisal as your joining date is after the cutoff date." });
            }
        }

        // Check profile completeness for alert flag
        const missingProfileFields = [];
        if (!faculty.scopusId) missingProfileFields.push("Scopus ID");
        if (!faculty.wosId) missingProfileFields.push("Web of Science ID");
        if (!faculty.orcidId) missingProfileFields.push("ORCID ID");
        if (!faculty.designation) missingProfileFields.push("Designation");

        const isProfileComplete = missingProfileFields.length === 0;

        const AcademicYear = require('../academicYear/academicYear.model');
        const acYearDoc = await AcademicYear.findById(academicYearId);
        const acYearString = acYearDoc ? acYearDoc.year : "2025-2026";
        const startYear = Number(acYearString.split('-')[0]) || 2025;
        const citationYear = startYear;
        const previousHIndexYear = startYear - 1;
        const currentHIndexYear = startYear;

        // Find all academic year IDs sharing the same year string due to program-specific documents
        const matchingYearDocs = acYearDoc
            ? await AcademicYear.find({ year: acYearDoc.year }).select("_id")
            : [];
        const matchingYearIds = matchingYearDocs.length > 0
            ? matchingYearDocs.map(y => y._id)
            : [academicYearId];


        // Check if there is an active saved Appraisal
        let appraisal = await Appraisal.findOne({ facultyId, academicYearId });

        // If appraisal is already submitted/evaluated, return it as-is
        if (appraisal && appraisal.status !== "Draft") {
            const proctoringEntries = await FacultyProctoringEntry.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } })
                .populate("programId", "name code programPattern")
                .populate("branchId", "name code");
            const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } });
            const contributions = await Contribution.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } }).populate("category");
            const adminRoles = await FacultyAdministration.findOne({ facultyId, academicYear: academicYearId });

            // Re-populate required fields for attachEligibilityInfo if not already populated
            await appraisal.populate([
                {
                    path: 'valueAddition.expertiseContribution.items.contributionId',
                    populate: { path: 'category' }
                },
                {
                    path: 'valueAddition.resourceUtilization.items.eventId'
                }
            ]);
            const appObj = appraisal.toObject();
            appObj.facultyId = faculty.toObject();
            attachEligibilityInfo(appObj, config);

            return res.json({
                success: true,
                isCalculatedFresh: false,
                data: appObj,
                proctoringDetail: proctoringEntries,
                proctoringDetails: proctoringEntries,
                resourceUtilizationDetails: resourceUt,
                contributionDetails: contributions,
                administrationDetail: adminRoles,
                faculty: faculty,
                isProfileComplete,
                missingProfileFields,
                citationYear,
                previousHIndexYear,
                currentHIndexYear
            });
        }



        // ==========================================
        // DYNAMIC CALCULATIONS
        // ==========================================

        // --- 1.1 Course Pass Percentage & 1.4 CO Attainment ---
        // Query by faculty's institutionId
        const subjectResults = await FacultySubjectResult.find({
            facultyId: faculty.institutionId,
            academicYearId: { $in: matchingYearIds }
        }).populate("branchId", "code");

        // 1.1 THEORY & INTEGRATED Courses Pass Percentage Points
        const theoryPP = [];
        let totalPPClaimed = 0;

        // 1.4 THEORY & INTEGRATED Courses CO Attainment Points
        const theoryCO = [];
        let totalCOClaimed = 0;

        // Determine if faculty has Cos for scoring caps
        let hasCos = faculty.Cos !== "no"; // defaults to yes if not explicitly "no"

        subjectResults.forEach(res => {
            if (["THEORY", "INTEGRATED", "Integrated"].includes(res.courseType)) {
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

                // CO points (only if faculty has COs)
                if (hasCos) {
                    let reached = res.noOfCosAttained || 0;
                    if (reached > 5) reached = 5;
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
            }
        });

        const ppAverage = theoryPP.length > 0 ? Number((totalPPClaimed / theoryPP.length).toFixed(2)) : 0;
        const coAverage = theoryCO.length > 0 ? Number((totalCOClaimed / theoryCO.length).toFixed(2)) : 0;

        // 1.2 Course Feedback
        const feedbackResults = await FacultyFeedResult.find({
            facultyId: faculty.institutionId,
            academicYearId: { $in: matchingYearIds },
            subjectType: { $in: ["Theory", "THEORY", "Integrated", "INTEGRATED"] }
        }).populate("branchId", "code");

        // Filter: Group all feedback records by course/section
        const feedbackGroups = {};
        feedbackResults.forEach(res => {
            const subjectKey = (res.subjectCode || res.subjectName || "").trim().toLowerCase();
            const sectionKey = (res.section || "").trim().toLowerCase();
            const branchKey = (res.branchId?.code || res.branch || "").trim().toLowerCase();
            const semYrKey = (res.semesterNumber || res.yearNumber || "").trim().toLowerCase();
            const key = `${subjectKey}_${sectionKey}_${branchKey}_${semYrKey}`;

            if (!feedbackGroups[key]) {
                feedbackGroups[key] = [];
            }
            feedbackGroups[key].push(res);
        });

        const feedbackItems = [];
        let totalFeedbackClaimed = 0;

        Object.values(feedbackGroups).forEach(group => {
            if (group.length === 0) return;

            // Select record with the highest percentage across phases
            const targetRecord = group.reduce((best, current) => {
                const bestPct = best.percentage || 0;
                const currentPct = current.percentage || 0;
                return (currentPct > bestPct) ? current : best;
            });

            const selectedPercentage = targetRecord.percentage || 0;

            // Calculate points based on the selected percentage
            const feedPoints = getPointsFromRanges(selectedPercentage, config.teaching.feedbackPoints);

            const semDisplay = targetRecord.yearNumber ? `YEAR-${targetRecord.yearNumber}` : targetRecord.semesterNumber ? `SEM-${targetRecord.semesterNumber}` : "";
            const branchDisplay = targetRecord.branchId?.code || targetRecord.branch || "";
            const secDisplay = targetRecord.section ? `- SEC ${targetRecord.section}` : "";
            const secBranchSem = `${semDisplay} ${branchDisplay} ${secDisplay}`.trim().replace(/\s+/g, ' ');

            feedbackItems.push({
                courseName: targetRecord.subjectName,
                secBranchSem: secBranchSem,
                noOfStudents: targetRecord.totalStudents || 0,
                totalStudents: targetRecord.totalStudents || 0,
                givenStudents: targetRecord.givenStudents || 0,
                feedbackPercentage: selectedPercentage,
                pointsClaimed: feedPoints
            });
            totalFeedbackClaimed += feedPoints;
        });

        const feedbackAverage = feedbackItems.length > 0 ? Number((totalFeedbackClaimed / feedbackItems.length).toFixed(2)) : 0;

        // 1.3 Proctoring Pass Percentage
        const proctoringEntries = await FacultyProctoringEntry.find({
            facultyId,
            academicYear: academicYearId,
            removedFromAppraisal: { $ne: true }
        }).populate("programId", "name code programPattern").populate("branchId", "name code");

        let hasProctoringDuties = appraisal?.teaching?.proctoring?.hasProctoringDuties ?? null;
        if (proctoringEntries.length > 0) {
            hasProctoringDuties = "Yes";
        }

        const proctoringItems = [];
        let totalProctorPoints = 0;

        if (hasProctoringDuties === "Yes") {
            for (const entry of proctoringEntries) {
                const procPoints = getPointsFromRanges(entry.passPercentage, config.teaching.proctoringPoints);
                proctoringItems.push({
                    programId: entry.programId?._id,
                    programCode: entry.programId?.code || entry.programme,
                    branchId: entry.branchId?._id,
                    branchCode: entry.branchId?.code || entry.branch,
                    semesterNumber: entry.semesterNumber,
                    yearNumber: entry.yearNumber,
                    section: entry.section,
                    totalStudents: entry.totalStudents || 0,
                    appeared: entry.eligibleStudents || 0,
                    passed: entry.passedStudents || 0,
                    percentage: entry.passPercentage || 0,
                    pointsClaimed: procPoints
                });
                totalProctorPoints += procPoints;
            }
        }

        const proctoringAverage = proctoringItems.length > 0 ? Number((totalProctorPoints / proctoringItems.length).toFixed(2)) : 0;

        let schoolId = null;
        let schoolName = "";
        let schoolCode = "";

        const servingDept = faculty.department;
        if (servingDept && servingDept.schoolIds && servingDept.schoolIds.length > 0) {
            const school = servingDept.schoolIds[0]; // Assuming populated
            schoolId = school._id;
            schoolName = school.name || "";
            schoolCode = school.code || "";
        }

        // Sum of all Teaching points (capped at 80 normally, 60 for those without Cos)
        const teachingMax = hasCos ? 80 : 60;
        const totalTeachingPoints = Math.min(teachingMax, Number((ppAverage + feedbackAverage + proctoringAverage + coAverage).toFixed(2)));

        // --- 2. Research Contributions ---

        // 2.1 Journals Publication
        const journals = await Journal.find({
            academicYear: academicYearId,
            status: "Approved",
            appraisalEligible: 'Yes',
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        const researchPapers = [];
        let totalPaperPoints = 0;

        for (const j of journals) {
            const ausCoAuthorsCount = (j.coAuthors || []).filter(c => c.employeeId && c.employeeId !== '').length;
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
                const searchName = j.journalName.trim().toUpperCase();
                const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const match = await mongoose.connection.db.collection('journalmasters').findOne({
                    journalTitle: new RegExp(`^${escapeRegExp(searchName)}$`)
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

            // researchPapers.push({
            //     paperId: j._id,
            //     paperType: 'Journal',
            //     title: j.paperTitle,
            //     scope: finalCategory,
            //     doi: j.doi,
            //     isMultiAUSAuthor,
            //     claimStatus,
            //     claimedBy,
            //     pointsClaimed: Number(points.toFixed(2)),
            //     impactFactor: jcrIF
            // });
            // totalPaperPoints += points;

            if (claimStatus !== "claimed_by_other" && claimStatus !== "requires_claim_action") {

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
                { 'authors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        // BookChapter.coAuthors.employeeId is String (institutionId e.g. "5741")
        const chapters = await BookChapter.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        // Conference.coAuthors.employeeId is String (institutionId e.g. "5741")
        const conferences = await Conference.find({
            academicYear: academicYearId,
            status: "Approved",
            appraisalEligible: 'Yes',
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        const bookChapterItems = [];
        let totalBookConfPoints = 0;

        for (const b of books) {
            if (b.appraisalClaimant && b.appraisalClaimant !== faculty.institutionId) {
                continue;
            }

            const ausAuthors = (b.authors || []).filter(a => a.employeeId);
            const isSingleAUSAuthor = ausAuthors.length === 0;

            let pts = 0;
            if (b.appraisalClaimant === faculty.institutionId || (!b.appraisalClaimant && isSingleAUSAuthor)) {
                pts = config.research.bookConferencePoints.isbnBook || 10;
            }
            const isbn = b.isbn || b.isbnNumber || null;
            bookChapterItems.push({
                itemId: b._id,
                itemType: 'Textbook',
                title: isbn ? `${b.title} (${isbn})` : b.title,
                isbn: isbn || "",
                publisher: b.publisher || "N/A",
                pointsClaimed: pts
            });
            totalBookConfPoints += pts;
        }

        for (const c of chapters) {
            if (c.appraisalClaimant && c.appraisalClaimant !== faculty.institutionId) {
                continue;
            }

            const ausCoAuthors = (c.coAuthors || []).filter(co =>
                (co.employeeId && co.employeeId !== '') ||
                (co.affiliation && co.affiliation.toLowerCase().includes('aditya'))
            );
            const isSingleAUSAuthor = ausCoAuthors.length === 0;

            let pts = 0;
            const isbn = c.isbnNumber || null;
            if ((c.appraisalClaimant === faculty.institutionId || (!c.appraisalClaimant && isSingleAUSAuthor)) && isbn) {
                pts = config.research.bookConferencePoints.isbnBookChapter || 5;
            }
            bookChapterItems.push({
                itemId: c._id,
                itemType: 'BookChapter',
                title: isbn ? `${c.chapterTitle} - ${c.textBookName} (${isbn})` : `${c.chapterTitle} - ${c.textBookName}`,
                isbn: isbn || "",
                publisher: c.publisher || "N/A",
                pointsClaimed: pts
            });
            totalBookConfPoints += pts;
        }

        for (const c of conferences) {
            if (c.appraisalClaimant && c.appraisalClaimant !== faculty.institutionId) {
                continue;
            }

            const ausCoAuthors = (c.coAuthors || []).filter(co =>
                (co.employeeId && co.employeeId !== '') ||
                (co.affiliation && co.affiliation.toLowerCase().includes('aditya'))
            );
            const isSingleAUSAuthor = ausCoAuthors.length === 0;

            let pts = 0;
            if (c.appraisalClaimant === faculty.institutionId || (!c.appraisalClaimant && isSingleAUSAuthor)) {
                pts = config.research.bookConferencePoints.scopusConference || 5;
            }
            const issn = c.issnIsbn || null;
            bookChapterItems.push({
                itemId: c._id,
                itemType: 'Conference',
                title: issn ? `${c.title} (${issn})` : c.title,
                isbn: issn || "",
                publisher: c.publisher || c.organizer || "N/A",
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
                { 'coInventors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        const patentItems = [];
        let totalPatentPoints = 0;

        patents.forEach(p => {
            if (p.appraisalClaimant && p.appraisalClaimant !== faculty.institutionId) {
                return; // skip
            }

            const ausCoInventors = (p.coInventors || []).filter(c => c.employeeId);
            const isSingleAUSAuthor = ausCoInventors.length === 0;

            let pts = 0;
            if (p.appraisalClaimant === faculty.institutionId || (!p.appraisalClaimant && isSingleAUSAuthor)) {
                const statusKey = p.patentStatus ? p.patentStatus.toLowerCase() : 'published';
                if (statusKey === 'published' || statusKey === 'granted') {
                    pts = config.research.patentPoints[statusKey] || (statusKey === 'granted' ? 20 : 5);
                }
            }
            patentItems.push({
                patentId: p._id,
                title: p.patentTitle || p.title,
                status: p.patentStatus,
                filingNo: p.filingNo || "N/A",
                dateOfFiling: p.dateOfFiling,
                country: p.patentFiledCountry || "India",
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
                { 'coDevelopers.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        const novelItems = [];
        let totalNovelPoints = 0;

        for (const n of novelProducts) {
            const ausCoDevelopersCount = (n.coDevelopers || []).filter(c => c.employeeId).length;
            const isMultiAUSAuthor = ausCoDevelopersCount > 0;

            let pts = 0;
            let claimStatus = "unclaimed";
            let claimedBy = null;

            const claimants = n.appraisalClaimants || [];

            if (claimants.includes(faculty.institutionId)) {
                claimStatus = "claimed_by_me";
            } else {
                claimStatus = "auto_eligible";
            }

            if (isClaimantEligible(n, faculty.institutionId)) {
                const categoryKey = n.category ? n.category.toLowerCase() : 'developed';
                pts = config.research.novelProductPoints[categoryKey] || (categoryKey === 'implemented' ? 20 : 10);
            }

            novelItems.push({
                productId: n._id,
                title: n.productName,
                status: n.category || 'Developed',
                organizationName: n.implementedOrganization || n.developedOrganization || "N/A",
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
                { 'coInvestigators.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        const consultancies = await Consultancy.find({
            academicYear: academicYearId,
            status: "Approved",
            $or: [
                { facultyId },
                { 'coInvestigators.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        const projectItems = [];
        let totalProjectPoints = 0;

        for (const p of fundedProjects) {
            let pts = 0;
            const ausCoInvestigatorsCount = (p.coInvestigators || []).filter(c => c.employeeId).length;
            const isMultiAUSAuthor = ausCoInvestigatorsCount > 0;

            let claimStatus = "unclaimed";
            let claimedBy = null;

            const claimants = p.appraisalClaimants || [];

            if (claimants.includes(faculty.institutionId)) {
                claimStatus = "claimed_by_me";
            } else {
                claimStatus = "auto_eligible";
            }

            if (p.applyingSeedGrant !== "Yes" && p.fundingAgencyAditya !== "Yes" && isClaimantEligible(p, faculty.institutionId)) {
                const statusKey = p.projectStatus ? p.projectStatus.toLowerCase() : 'sanctioned';
                if (statusKey === 'sanctioned') {
                    const amountInLakhs = Number(((parseFloat(p.sanctionedAmount) || 0) / 100000).toFixed(2));
                    pts = amountInLakhs * (config.research.projectProposalPoints.sanctionedPerLakh || 5);
                } else {
                    pts = config.research.projectProposalPoints.shortlisted || 5;
                }
            }

            projectItems.push({
                projectId: p._id,
                projectType: 'FundedProject',
                title: p.title,
                agency: p.fundingAgency,
                amountInLakhs: Number(((parseFloat(p.sanctionedAmount) || 0) / 100000).toFixed(2)),
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

            const claimants = c.appraisalClaimants || [];

            if (claimants.includes(faculty.institutionId)) {
                claimStatus = "claimed_by_me";
            } else {
                claimStatus = "auto_eligible";
            }

            if (c.applyingSeedGrant !== "Yes" && c.fundingAdityaUniversity !== "Yes" && isClaimantEligible(c, faculty.institutionId)) {
                const statusKey = c.projectStatus ? c.projectStatus.toLowerCase() : 'sanctioned';
                if (statusKey === 'sanctioned') {
                    const amountInLakhs = Number(((parseFloat(c.amount) || 0) / 100000).toFixed(2));
                    pts = amountInLakhs * (config.research.projectProposalPoints.sanctionedPerLakh || 5);
                } else {
                    pts = config.research.projectProposalPoints.shortlisted || 5;
                }
            }

            projectItems.push({
                projectId: c._id,
                projectType: 'Consultancy',
                title: c.title,
                agency: c.fundingAgency,
                amountInLakhs: Number(((parseFloat(c.amount) || 0) / 100000).toFixed(2)),
                status: c.projectStatus || 'Sanctioned',
                isMultiAUSAuthor,
                claimStatus,
                claimedBy,
                pointsClaimed: Number(pts.toFixed(2))
            });
            totalProjectPoints += pts;
        }

        // Retrieve from AuthorCitations if exists
        const AuthorCitations = require('../AuthorCitations/AuthorCitations.model');
        const authorCitationsDoc = await AuthorCitations.findOne({ empid: faculty.institutionId });

        let latestCitations = null;
        let latestHIndexPrevYear = null;
        let latestHIndexCurrentYear = null;

        if (authorCitationsDoc) {
            latestCitations = (authorCitationsDoc.citations && authorCitationsDoc.citations.get)
                ? authorCitationsDoc.citations.get(String(citationYear))
                : authorCitationsDoc.citations?.[String(citationYear)];
            if (latestCitations === undefined) latestCitations = null;

            latestHIndexPrevYear = (authorCitationsDoc.hIndex && authorCitationsDoc.hIndex.get)
                ? authorCitationsDoc.hIndex.get(String(previousHIndexYear))
                : authorCitationsDoc.hIndex?.[String(previousHIndexYear)];
            if (latestHIndexPrevYear === undefined) latestHIndexPrevYear = null;

            latestHIndexCurrentYear = (authorCitationsDoc.hIndex && authorCitationsDoc.hIndex.get)
                ? authorCitationsDoc.hIndex.get(String(currentHIndexYear))
                : authorCitationsDoc.hIndex?.[String(currentHIndexYear)];
            if (latestHIndexCurrentYear === undefined) latestHIndexCurrentYear = null;
        }

        const savedCitations = latestCitations !== null ? latestCitations : (appraisal ? appraisal.research.scopusCitations : null);
        const savedHIndexPrevYear = latestHIndexPrevYear !== null ? latestHIndexPrevYear : (appraisal ? appraisal.research.hIndexPrevYear : null);
        const savedHIndexCurrentYear = latestHIndexCurrentYear !== null ? latestHIndexCurrentYear : (appraisal ? appraisal.research.hIndexCurrentYear : null);
        const savedCitationStatus = (latestCitations !== null) ? "Approved" : (appraisal ? (appraisal.research.scopusCitationStatus || "Pending") : "Pending");
        const savedHIndexStatus = (latestHIndexPrevYear !== null && latestHIndexCurrentYear !== null) ? "Approved" : (appraisal ? (appraisal.research.scopusHIndexStatus || "Pending") : "Pending");
        const savedCitationRemarks = appraisal ? (appraisal.research.scopusCitationRemarks || "") : "";
        const savedHIndexRemarks = appraisal ? (appraisal.research.scopusHIndexRemarks || "") : "";

        const citationRateVal = config?.research?.citationRate ?? 0.2;
        const hRateLow = config?.research?.hIndexRateLow ?? 1;
        const hRateMid = config?.research?.hIndexRateMid ?? 2;
        const hRateHigh = config?.research?.hIndexRateHigh ?? 4;
        const citationPointsVal = savedCitations !== null ? Math.round(savedCitations * citationRateVal * 10) / 10 : 0;
        const hIndexPointsVal = computeHIndexPoints(savedHIndexPrevYear || 0, savedHIndexCurrentYear || 0, hRateLow, hRateMid, hRateHigh);

        const savedCitationPoints = savedCitations !== null ? citationPointsVal : (appraisal ? appraisal.research.scopusCitationScore : 0);
        const savedHIndexPoints = (savedHIndexPrevYear !== null && savedHIndexCurrentYear !== null) ? hIndexPointsVal : (appraisal ? appraisal.research.scopusHIndexScore : 0);

        const appraisalStatus = appraisal ? appraisal.status : "Draft";
        const isDraftOrRejected = appraisalStatus === "Draft" || appraisalStatus === "Rejected by HOD";

        const citationScoreFinal = (savedCitationStatus === "Approved" || isDraftOrRejected) ? savedCitationPoints : 0;
        const hIndexPointsFinal = (savedHIndexStatus === "Approved" || isDraftOrRejected) ? savedHIndexPoints : 0;

        const totalResearchPoints = Number((
            totalPaperPoints + totalPhdPoints + cappedBookConfPoints +
            totalPatentPoints + totalNovelPoints + totalProjectPoints +
            citationScoreFinal + hIndexPointsFinal
        ).toFixed(2));

        // --- 3. Extension / Value Addition ---

        // 3.1 Faculty resource utilization
        const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } });
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
                    // Use daysParticipated as authoritative day count for points calculation.
                    // If daysParticipated is missing, fallback to duration.
                    const participantDays = r.daysParticipated || r.duration || 1;
                    pts = participantDays * (resourceUtConf.participated ?? 1);
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
        const contributions = await Contribution.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } }).populate("category");
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

                const catCode = c.category?.code || parseInt(c.category);
                switch (catCode) {
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
                            pts = expPointsConf.nptel4W ?? 5; // fallback to lowest tier (4W = 5pts)
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
                    const level = (r.level || '').toLowerCase();
                    const isCentral = level.includes('central') || level.includes('institute');

                    const catalogEntry = ADMIN_ROLE_CATALOG.find(c => c.roleId === r.roleId);

                    if (catalogEntry) {
                        const pg = catalogEntry.pointsGroup;
                        const key = pg + (isCentral ? 'Central' : 'Dept');
                        pts = adminConf[key] ?? pts;
                    } else if (r.roleName && r.roleName.toLowerCase().startsWith('any other')) {
                        // fallback for old un-migrated or "other"
                        pts = isCentral ? (adminConf.otherCentral ?? 10) : (adminConf.otherDept ?? 5);
                    } else {
                        pts = isCentral ? (adminConf.otherCentral ?? 10) : (adminConf.otherDept ?? 5);
                    }

                    adminItems.push({
                        roleId: r.roleId || "",
                        activityName: r.roleLabel || r.roleName,
                        level: r.level || "Dept level",
                        pointsClaimed: pts
                    });
                    totalAdminPoints += pts;
                }
            });
        }

        const cappedAdminPoints = Math.min(config.administration?.maxPoints ?? 20, totalAdminPoints);

        // Compile updated dynamic snapshot details
        const evaluatedCategory = getFacultyCategoryHelper(faculty);

        let deptName = "N/A";
        if (faculty.department) {
            deptName = (faculty.department.type === 'Central' && faculty.coreDepartment)
                ? faculty.coreDepartment.name
                : faculty.department.name;
        }

        const updatedAppraisalData = {
            facultyId,
            academicYearId,
            status: "Draft",
            facultyCategory: evaluatedCategory,
            personalInfoSnapshot: {
                name: faculty.name,
                institutionId: faculty.institutionId,
                departmentName: deptName,
                designation: faculty.designation || "N/A",
                scopusId: faculty.scopusId || "",
                wosId: faculty.wosId || "",
                orcidId: faculty.orcidId || "",
                dateOfJoining: faculty.dateOfJoining || faculty.createdAt, // fallback
                qualification: (() => {
                    if (faculty.qualifications && faculty.qualifications.length > 0) {
                        const weight = { "Doctoral": 3, "PG": 2, "UG": 1 };
                        const sortedQuals = [...faculty.qualifications].sort((a, b) => (weight[b.level] || 0) - (weight[a.level] || 0));
                        const hq = sortedQuals[0];
                        if (hq && hq.qualification) {
                            const dateStr = [hq.completedMonth, hq.completedYear].filter(Boolean).join(', ');
                            return dateStr ? `${hq.qualification} (${dateStr})` : hq.qualification;
                        }
                    }
                    return faculty.qualification || "N/A";
                })(),
                qualifications: faculty.qualifications || [],
                schoolId: schoolId,
                schoolName: schoolName,
                schoolCode: schoolCode,
                hasCos: hasCos
            },
            teaching: {
                passPercentage: { courses: theoryPP, averagePoints: ppAverage },
                feedback: { courses: feedbackItems, averagePoints: feedbackAverage },
                proctoring: { entries: proctoringItems, averagePoints: proctoringAverage, hasProctoringDuties: hasProctoringDuties },
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
                scopusCitations: savedCitations,
                hIndexPrevYear: savedHIndexPrevYear,
                hIndexCurrentYear: savedHIndexCurrentYear,
                scopusCitationStatus: savedCitationStatus,
                scopusHIndexStatus: savedHIndexStatus,
                scopusCitationRemarks: savedCitationRemarks,
                scopusHIndexRemarks: savedHIndexRemarks,
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

        await appraisal.populate([
            {
                path: 'valueAddition.expertiseContribution.items.contributionId',
                populate: { path: 'category' }
            },
            {
                path: 'valueAddition.resourceUtilization.items.eventId'
            }
        ]);
        const appObj = appraisal.toObject();
        appObj.facultyId = faculty.toObject();
        attachEligibilityInfo(appObj, config);

        res.json({
            success: true,
            isCalculatedFresh: true,
            isProfileComplete,
            missingProfileFields,
            data: appObj,
            proctoringDetail: proctoringEntries,
            proctoringDetails: proctoringEntries,
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

        if (appraisal.status !== "Draft" && !appraisal.status.includes("Rejected")) {
            return res.status(400).json({ success: false, message: "Appraisal has already been submitted." });
        }

        // Retrieve faculty information for category check
        const faculty = await Employee.findById(facultyId);
        if (!faculty) {
            return res.status(404).json({ success: false, message: "Faculty profile not found." });
        }
        if (!faculty.department) {
            return res.status(400).json({ success: false, message: "Your Serving Department is not set. Please contact the Administrator to assign it before submitting your appraisal." });
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
        const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId, status: { $ne: "Rejected" }, removedFromAppraisal: { $ne: true } });
        const hasValidFdp = resourceUt.some(r => {
            const cat = (r.activityCategory || '').toLowerCase().trim();
            const type = (r.activityType || '').toLowerCase().trim();
            const org = (r.organizingInstitutionCategory || '').toLowerCase().trim();
            const days = Number(r.numberOfDaysParticipated) || Number(r.daysParticipated) || Number(r.duration) || 0;
            if (cat === 'fdp' && type === 'fdp participant' && days >= 5 && (allowedOrg.includes(org) || org.includes('recognised') || org.includes('recognized'))) {
                if (org.includes("nirf")) {
                    const rank = Number(r.nirfRank);
                    return !isNaN(rank) && rank > 0 && rank < 200;
                }
                return true;
            }
            return false;
        });

        // 2. Check Coursera (>= 40 Hours) in Contributions
        const contributions = await Contribution.find({ facultyId, academicYear: academicYearId, status: { $ne: "Rejected" }, removedFromAppraisal: { $ne: true } }).populate("category");
        const hasValidCoursera40Hours = contributions.some(c => {
            const cat = c.category?.code || parseInt(c.category);
            return cat === 12 && Number(c.courseHours) >= 40;
        });

        // Validate Condition 2: Metric 2.1 Score
        const metric21Score = appraisal.research?.papers?.totalClaimed || 0;
        // Validation removed as per new update (No gating for submission)

        // Update all Draft entries for ResourceUtilization and Contribution to Pending
        // Keeping "Pending at HOD" for backwards compatibility, or maybe change to a generic "Pending" if needed.
        await ResourceUtilization.updateMany(
            { facultyId, academicYear: academicYearId, status: "Draft" },
            { status: "Pending at HOD" }
        );
        await Contribution.updateMany(
            { facultyId, academicYear: academicYearId, status: "Draft" },
            { status: "Pending at HOD" }
        );

        let nextStatus = "Submitted to Dean"; // Default

        const schoolCode = (appraisal.personalInfoSnapshot?.schoolCode || "").toUpperCase();
        const empId = (faculty.institutionId || "").trim().toUpperCase();

        const designationRoutingMap = {
            "3541": "Vice Chancellor", // Professor & Dean - Research & Consultancy
            "4117": "Vice Chancellor", // Professor & Dean (International Relations)
            "79": "Vice Chancellor", // Asst.Professor & Controller Of Examinations
            "190": "Vice Chancellor", // Professor & Dean (IQAC)
            "5150": "Vice Chancellor", // Professor & Dean (Career Development)
            "497": "Dy. Pro Chancellor", // Assoc. Professor Of Physics & Dean(Admissions)
            "159": "Registrar", // Asst. Prof. Dean Administration
            "710": "Registrar", // Assoc.Prof. & Dean (Students Affairs)
            "286": "Pro Vice-Chancellor (E & S)", // Professor & Dean-School Of Engg.
            "1353": "Pro Vice-Chancellor (E & S)", // Professor & Dean School Of Pharmacy
            "1957": "Pro Vice-Chancellor (E & S)", // Professor & Dean - Student Welfar
            "514": "Pro Vice-Chancellor (E & S)", // Assoc.Prof. & Assoc. Dean-School Of Computing
            "5480": "Pro Vice-Chancellor (E & S)", // Asst. Prof. & Assoc. Dean-School Of Sciences
            "666": "Pro Vice-Chancellor (E & S)", // Assoc. Professor & Assoc. Dean-Freshmen Engg.
            "6048": "Pro Vice-Chancellor (S & P)", // Asst. Prof. & Assoc. Dean-School Of Business
            "114": "Dean - (IQAC)", // Asst. Professor  Of Maths & Assoc. Dean (IQAC)
            "497": "Dean - (Admissions)", // Assoc. Professor & Assoc. Dean-Admissions
            "5177": "Pro Vice-Chancellor (A)", // Assoc. Professor & Assoc.Dean-Academics
            "6120": "Registrar", // Assoc. Professor & Asst. Registrar
            "1565": "Registrar", // Asst. Professor & Asst. Registrar
            "1275": "Registrar", // Asst.Prof. & Head Of IT Applications
            "2225": 'Pro Vice-Chancellor (E & S)', // ACET DEAN
            "deputyce1": 'Controlelr of Examinations', //deputycontrolelrexam1
            "deputyce2": 'Controlelr of Examinations',//deputycontrolelrexam2
            "deputyce3": 'Controlelr of Examinations',//deputycontrolelrexam3
            "deputyce4": 'Controlelr of Examinations',//deputycontrolelrexam4

        };

        if (designationRoutingMap[empId]) {
            nextStatus = "Submitted to " + designationRoutingMap[empId];
        } else {
            const hodRoleIds = ["HOD", "DEPARTMENT HOD", "DEPARTMENT_HOD"];
            const userRoles = (req.user.roles || []).map(r => typeof r === 'string' ? r.toUpperCase() : (r.role?.key?.toUpperCase() || r.role?.toUpperCase() || r.role || ''));
            const isHOD = userRoles.some(role => hodRoleIds.includes(role));

            if (isHOD) {
                nextStatus = "Submitted to Dean";
            } else {
                const schoolsWithHOD = ["ACET", "SOE", "SOC", "FE"];
                if (schoolsWithHOD.includes(schoolCode)) {
                    nextStatus = "Submitted to HOD";
                } else {
                    nextStatus = "Submitted to Dean";
                }
            }
        }

        // Lock and submit
        appraisal.status = nextStatus;
        await appraisal.save();

        res.json({ success: true, message: `Appraisal ${nextStatus} successfully.`, data: appraisal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 6. HOD Pending list
exports.getPendingHODAppraisals = async (req, res) => {
    try {
        const Employee = require("../employee/employee.model");
        const { ADMIN_ROLE_CATALOG } = require("../FacultyAdministration/adminRoleCatalog");
        const { getHODDepartments } = require("../../utils/hodHelper");

        const deptIds = await getHODDepartments(req.user);

        // Find all faculty in HOD's department (EXCLUDE THEMSELVES)
        const facultyIds = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ],
            _id: { $ne: req.user.userId }
        }).distinct('_id');

        const appraisals = await Appraisal.find({
            facultyId: { $in: facultyIds },
            $or: [
                { status: "Submitted to HOD" },
                { status: "Rejected by HOD" },
                { "hodEvaluation.evaluatedBy": { $exists: true } }
            ]
        })
            .populate("facultyId", "name institutionId coreDepartment department doctorate leadership qualification")
            .populate("academicYearId", "year")
            .populate([
                {
                    path: 'valueAddition.expertiseContribution.items.contributionId',
                    populate: { path: 'category' }
                },
                {
                    path: 'valueAddition.resourceUtilization.items.eventId'
                }
            ]);

        const config = await AppraisalConfig.findOne({ isActive: true }); // Assuming active config or we can match academicYearId from the appraisals

        const appraisalsWithDetails = [];
        for (const app of appraisals) {
            const facultyId = app.facultyId._id;
            const academicYearId = app.academicYearId._id;

            const proctoringEntries = await FacultyProctoringEntry.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } })
                .populate("programId", "name code programPattern")
                .populate("branchId", "name code");
            const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } });
            const contributions = await Contribution.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } }).populate("category");
            const adminRoles = await FacultyAdministration.findOne({ facultyId, academicYear: academicYearId });

            const appObj = app.toObject();
            appObj.proctoringDetail = proctoringEntries;
            appObj.proctoringDetails = proctoringEntries;
            appObj.resourceUtilizationDetails = resourceUt;
            appObj.contributionDetails = contributions;
            appObj.administrationDetail = adminRoles;

            attachEligibilityInfo(appObj, config);

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
        const { interpersonalRatings, comments, action, awardedResUtilPoints } = req.body; // action can be 'Approve' or 'Reject'

        const appraisal = await Appraisal.findById(id);
        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal not found." });
        }

        const targetRoleName = appraisal.status.startsWith("Submitted to ")
            ? appraisal.status.replace("Submitted to ", "")
            : "HOD";
        const isBypassedHOD = targetRoleName !== "HOD";

        if (action === "Reject") {
            appraisal.status = `Rejected by ${targetRoleName}`;

            if (!appraisal.rejectionHistory) appraisal.rejectionHistory = [];
            appraisal.rejectionHistory.push({
                role: isBypassedHOD ? req.user.role : 'HOD',
                roleLabel: targetRoleName,
                comments,
                date: new Date(),
                evaluatedBy: req.user.userId
            });
            // Clear hodEvaluation so they can start fresh on resubmission, except maybe interpersonalRatings
            appraisal.hodEvaluation = undefined;
            await appraisal.save();

            const facultyId = appraisal.facultyId;
            const academicYearId = appraisal.academicYearId;

            // User requested: At the time of rejection, any items in section 3.1 (Resource Utilization),
            // 3.2 (Expertise Contribution) that are currently "Pending at HOD"
            // should automatically have their status reverted back to "Draft" so the faculty can edit them.
            await ResourceUtilization.updateMany(
                { facultyId, academicYear: academicYearId, status: "Pending at HOD" },
                { $set: { status: "Draft" } }
            );

            await Contribution.updateMany(
                { facultyId, academicYear: academicYearId, status: "Pending at HOD" },
                { $set: { status: "Draft" } }
            );

            await FacultyAdministration.updateMany(
                { facultyId, academicYear: academicYearId, status: "Pending" },
                { $set: { status: "Draft" } }
            );

            return res.json({ success: true, message: "Appraisal sent back to faculty. Pending individual items reverted to Draft.", data: appraisal });
        }

        if (action === "Approve") {
            const facultyId = appraisal.facultyId;
            const academicYearId = appraisal.academicYearId;

            // Auto-approve Scopus citations and h-index
            appraisal.research.scopusCitationStatus = "Approved";
            appraisal.research.scopusHIndexStatus = "Approved";

            // Recalculate research score
            const baseResearch = (appraisal.research.papers?.totalClaimed || 0) +
                (appraisal.research.phdGuiding?.totalClaimed || 0) +
                (appraisal.research.booksChapters?.totalClaimed || 0) +
                (appraisal.research.patents?.totalClaimed || 0) +
                (appraisal.research.novelProducts?.totalClaimed || 0) +
                (appraisal.research.projectsConsultancies?.totalClaimed || 0);

            const citationScoreFinal = appraisal.research.scopusCitationScore || 0;
            const hIndexPointsFinal = appraisal.research.scopusHIndexScore || 0;

            appraisal.research.totalClaimed = Number((baseResearch + citationScoreFinal + hIndexPointsFinal).toFixed(2));

            // Check if any ACTIVE (not removed from appraisal) entries are still Rejected.
            // Records the faculty removed from the appraisal (removedFromAppraisal: true)
            // must NOT block approval — they are no longer part of this submission.
            const hasRejectedProctoring = await FacultyProctoringEntry.exists({ facultyId, academicYear: academicYearId, status: "Rejected", removedFromAppraisal: { $ne: true } });
            const hasRejectedResourceUt = await ResourceUtilization.exists({ facultyId, academicYear: academicYearId, status: "Rejected", removedFromAppraisal: { $ne: true } });
            const hasRejectedContribution = await Contribution.exists({ facultyId, academicYear: academicYearId, status: "Rejected", removedFromAppraisal: { $ne: true } });
            const hasRejectedAdmin = await FacultyAdministration.exists({ facultyId, academicYear: academicYearId, status: "Rejected" });

            if (hasRejectedProctoring || hasRejectedResourceUt || hasRejectedContribution || hasRejectedAdmin) {
                return res.status(400).json({ success: false, message: "Cannot approve appraisal while there are rejected sections. Please reject the overall appraisal so the faculty can correct them." });
            }

            // Update manually awarded points for Resource Utilization Participated roles in Appraisal document
            if (awardedResUtilPoints && typeof awardedResUtilPoints === 'object') {
                if (appraisal.valueAddition && appraisal.valueAddition.resourceUtilization && appraisal.valueAddition.resourceUtilization.items) {
                    appraisal.valueAddition.resourceUtilization.items.forEach(item => {
                        if (item.eventId && awardedResUtilPoints[item.eventId.toString()] !== undefined) {
                            let pts = Number(awardedResUtilPoints[item.eventId.toString()]);
                            if (pts < 0) pts = 0;
                            if (pts > 10) pts = 10;
                            item.awardedPoints = pts;
                        }
                    });
                }
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

        if (isBypassedHOD) {
            // Acting as primary evaluator; approval completes both levels in one step.
            appraisal.status = `Approved by ${targetRoleName}`;
        } else {
            appraisal.status = "Submitted to Dean";
        }

        await appraisal.save();

        res.json({ success: true, message: `Appraisal evaluated and ${appraisal.status}.`, data: appraisal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 8. R&D Pending list
exports.getPendingRNDAppraisals = async (req, res) => {
    try {
        const appraisals = await Appraisal.find({
            status: { $in: ["Pending Research Admin", "Completed"] }
        })
            .populate("facultyId", "name institutionId coreDepartment department designation qualification email phone profileImage college leadership")
            .populate("academicYearId", "year")
            .populate([
                {
                    path: 'valueAddition.expertiseContribution.items.contributionId',
                    populate: { path: 'category' }
                },
                {
                    path: 'valueAddition.resourceUtilization.items.eventId'
                }
            ]);

        const AuthorCitations = require('../AuthorCitations/AuthorCitations.model');
        const AppraisalConfig = require('./AppraisalConfig.model');

        for (let appraisal of appraisals) {
            if (appraisal.status === "Pending Research Admin") {
                const empid = appraisal.personalInfoSnapshot?.institutionId || appraisal.facultyId?.institutionId;
                if (empid) {
                    const authorCitationsDoc = await AuthorCitations.findOne({ empid });
                    if (authorCitationsDoc) {
                        const acYearString = appraisal.academicYearId ? appraisal.academicYearId.year : "2025-2026";
                        const startYear = Number(acYearString.split('-')[0]) || 2025;
                        const previousYear = startYear - 1;
                        const currentYear = startYear;

                        const citationsCurrentYear = (authorCitationsDoc.citations && authorCitationsDoc.citations.get)
                            ? (authorCitationsDoc.citations.get(String(currentYear)) ?? null)
                            : (authorCitationsDoc.citations?.[String(currentYear)] ?? null);

                        const hIndexPrevYear = (authorCitationsDoc.hIndex && authorCitationsDoc.hIndex.get)
                            ? (authorCitationsDoc.hIndex.get(String(previousYear)) ?? null)
                            : (authorCitationsDoc.hIndex?.[String(previousYear)] ?? null);

                        const hIndexCurrentYear = (authorCitationsDoc.hIndex && authorCitationsDoc.hIndex.get)
                            ? (authorCitationsDoc.hIndex.get(String(currentYear)) ?? null)
                            : (authorCitationsDoc.hIndex?.[String(currentYear)] ?? null);

                        let modified = false;

                        if (citationsCurrentYear !== null && appraisal.research.scopusCitations !== citationsCurrentYear) {
                            appraisal.research.scopusCitations = citationsCurrentYear;
                            modified = true;
                        }
                        if (hIndexPrevYear !== null && appraisal.research.hIndexPrevYear !== hIndexPrevYear) {
                            appraisal.research.hIndexPrevYear = hIndexPrevYear;
                            modified = true;
                        }
                        if (hIndexCurrentYear !== null && appraisal.research.hIndexCurrentYear !== hIndexCurrentYear) {
                            appraisal.research.hIndexCurrentYear = hIndexCurrentYear;
                            modified = true;
                        }

                        if (modified) {
                            const config = await AppraisalConfig.findOne({ academicYearId: appraisal.academicYearId });
                            if (appraisal.research.scopusCitations !== null) {
                                const citationRate = config?.research?.citationRate ?? 0.2;
                                appraisal.research.scopusCitationScore = Math.round(appraisal.research.scopusCitations * citationRate * 10) / 10;
                            }
                            if (appraisal.research.hIndexPrevYear !== null && appraisal.research.hIndexCurrentYear !== null) {
                                const hRateLow = config?.research?.hIndexRateLow ?? 1;
                                const hRateMid = config?.research?.hIndexRateMid ?? 2;
                                const hRateHigh = config?.research?.hIndexRateHigh ?? 4;
                                appraisal.research.scopusHIndexScore = computeHIndexPoints(appraisal.research.hIndexPrevYear, appraisal.research.hIndexCurrentYear, hRateLow, hRateMid, hRateHigh);
                            }
                        }

                        if (modified) {
                            const paperPts = appraisal.research.papers?.totalClaimed || 0;
                            const phdPts = appraisal.research.phdGuiding?.totalClaimed || 0;
                            const bookPts = appraisal.research.booksChapters?.totalClaimed || 0;
                            const patentPts = appraisal.research.patents?.totalClaimed || 0;
                            const novelPts = appraisal.research.novelProducts?.totalClaimed || 0;
                            const projPts = appraisal.research.projectsConsultancies?.totalClaimed || 0;

                            const citationScoreFinal = appraisal.research.scopusCitationScore || 0;
                            const hIndexPointsFinal = appraisal.research.scopusHIndexScore || 0;

                            appraisal.research.totalClaimed = Number((
                                paperPts + phdPts + bookPts + patentPts + novelPts + projPts +
                                citationScoreFinal + hIndexPointsFinal
                            ).toFixed(2));

                            await appraisal.save();
                        }
                    }
                }
            }
        }

        const config = await AppraisalConfig.findOne({ isActive: true });
        const appraisalsObj = appraisals.map(app => {
            const appObj = app.toObject();
            return attachEligibilityInfo(appObj, config);
        });

        res.json({ success: true, data: appraisalsObj });
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
            hIndexPrevYear,
            hIndexCurrentYear,
            scopusCitationScore,
            scopusHIndexScore,
            scopusCitationStatus,
            scopusHIndexStatus,
            scopusCitationRemarks,
            scopusHIndexRemarks,
            comments,
            isDraft
        } = req.body;

        const appraisal = await Appraisal.findById(id);
        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal not found." });
        }

        if (scopusCitations !== undefined) appraisal.research.scopusCitations = scopusCitations === null ? null : Number(scopusCitations);
        if (hIndexPrevYear !== undefined) appraisal.research.hIndexPrevYear = hIndexPrevYear === null ? null : Number(hIndexPrevYear);
        if (hIndexCurrentYear !== undefined) appraisal.research.hIndexCurrentYear = hIndexCurrentYear === null ? null : Number(hIndexCurrentYear);
        if (scopusCitationScore !== undefined) appraisal.research.scopusCitationScore = Number(scopusCitationScore) || 0;
        if (scopusHIndexScore !== undefined) appraisal.research.scopusHIndexScore = Number(scopusHIndexScore) || 0;

        if (scopusCitationStatus !== undefined) appraisal.research.scopusCitationStatus = scopusCitationStatus;
        if (scopusHIndexStatus !== undefined) appraisal.research.scopusHIndexStatus = scopusHIndexStatus;
        if (scopusCitationRemarks !== undefined) appraisal.research.scopusCitationRemarks = scopusCitationRemarks;
        if (scopusHIndexRemarks !== undefined) appraisal.research.scopusHIndexRemarks = scopusHIndexRemarks;

        // Recalculate total research points
        const baseResearch = appraisal.research.papers.totalClaimed +
            appraisal.research.phdGuiding.totalClaimed +
            appraisal.research.booksChapters.totalClaimed +
            appraisal.research.patents.totalClaimed +
            appraisal.research.novelProducts.totalClaimed +
            appraisal.research.projectsConsultancies.totalClaimed;

        const citationScoreFinal = appraisal.research.scopusCitationStatus === "Approved" ? appraisal.research.scopusCitationScore : 0;
        const hIndexPointsFinal = appraisal.research.scopusHIndexStatus === "Approved" ? appraisal.research.scopusHIndexScore : 0;

        appraisal.research.totalClaimed = Number((baseResearch + citationScoreFinal + hIndexPointsFinal).toFixed(2));

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

        // Write back to AuthorCitations for consistency
        const empid = appraisal.personalInfoSnapshot?.institutionId;
        if (empid && scopusCitations !== undefined) {
            const AuthorCitations = require('../AuthorCitations/AuthorCitations.model');
            const AcademicYear = require('../academicYear/academicYear.model');
            const acYearDoc = await AcademicYear.findById(appraisal.academicYearId);
            if (acYearDoc) {
                const [startYearStr] = acYearDoc.year.split('-');
                const startYear = parseInt(startYearStr, 10);

                let doc = await AuthorCitations.findOne({ empid });
                if (!doc) {
                    doc = new AuthorCitations({ empid, citations: {}, hIndex: {} });
                }

                doc.citations.set(String(startYear), Number(scopusCitations));
                if (hIndexPrevYear !== undefined && hIndexPrevYear !== null) {
                    doc.hIndex.set(String(startYear - 1), Number(hIndexPrevYear));
                }
                if (hIndexCurrentYear !== undefined && hIndexCurrentYear !== null) {
                    doc.hIndex.set(String(startYear), Number(hIndexCurrentYear));
                }

                await doc.save();
            }
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
        const faculty = await Employee.findById(facultyId);

        const unresolved = [];

        // 1. Journals — fetch where faculty is applicant OR stored as co-author
        const journals = await Journal.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },                                     // faculty is applicant
                { 'coAuthors.employeeId': faculty.institutionId }  // faculty is co-author (institutionId stored)
            ]
        }).populate('facultyId', 'name institutionId');



        for (const j of journals) {
            // Include AUS co-authors: those with employeeId OR affiliation = Aditya University
            const ausCoAuthors = j.coAuthors.filter(c =>
                (c.employeeId && c.employeeId !== '') ||
                (c.affiliation && c.affiliation.toLowerCase().includes('aditya'))
            );
            if (ausCoAuthors.length > 0) {
                // Build claimants directly from stored co-author data — no Employee DB lookup needed
                const coAuthorClaimants = ausCoAuthors.map(c => ({
                    name: c.name,
                    institutionId: c.employeeId || null  // empId string e.g. "5741"
                }));

                const claimants = [
                    { name: j.facultyId.name, institutionId: j.facultyId.institutionId },
                    ...coAuthorClaimants
                ];
                // Deduplicate by institutionId (or name if no institutionId)
                const uniqueClaimants = claimants.filter((v, i, a) =>
                    a.findIndex(t => (v.institutionId && t.institutionId === v.institutionId) || (!v.institutionId && t.name === v.name)) === i
                );

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
                { 'coInventors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        for (const p of patents) {
            const ausCoInventors = p.coInventors.filter(c => c.employeeId);
            if (ausCoInventors.length > 0) {
                const claimants = [
                    { _id: p.facultyId._id, name: p.facultyId.name, institutionId: p.facultyId.institutionId },
                    ...ausCoInventors.map(c => ({ _id: c.employeeId, name: c.name, institutionId: c.employeeId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t.institutionId === v.institutionId) === i);

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
        // BookChapter.coAuthors.employeeId is String (institutionId)
        const chapters = await BookChapter.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        for (const c of chapters) {
            const ausCoAuthors = c.coAuthors.filter(co =>
                (co.employeeId && co.employeeId !== '') ||
                (co.affiliation && co.affiliation.toLowerCase().includes('aditya'))
            );
            if (ausCoAuthors.length > 0) {
                // Build claimants directly from stored co-author data — no Employee DB lookup needed
                const coAuthorClaimants = ausCoAuthors.map(co => ({
                    name: co.name,
                    institutionId: co.employeeId || null
                }));

                const claimants = [
                    { name: c.facultyId.name, institutionId: c.facultyId.institutionId },
                    ...coAuthorClaimants
                ];
                const uniqueClaimants = claimants.filter((v, i, a) =>
                    a.findIndex(t => (v.institutionId && t.institutionId === v.institutionId) || (!v.institutionId && t.name === v.name)) === i
                );

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
                { 'authors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        for (const tb of textbooks) {
            const ausAuthors = tb.authors.filter(a => a.employeeId);
            if (ausAuthors.length > 0) {
                const claimants = [
                    { _id: tb.facultyId._id, name: tb.facultyId.name, institutionId: tb.facultyId.institutionId },
                    ...ausAuthors.map(a => ({ _id: a.employeeId, name: a.authorName || a.name, institutionId: a.employeeId }))
                ];
                const uniqueClaimants = claimants.filter((v, i, a) => a.findIndex(t => t.institutionId === v.institutionId) === i);

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
        // Conference.coAuthors.employeeId is String (institutionId)
        const conferences = await Conference.find({
            academicYear: academicYearId,
            status: 'Approved',
            appraisalClaimant: null,
            $or: [
                { facultyId },
                { 'coAuthors.employeeId': faculty.institutionId }
            ]
        }).populate('facultyId', 'name institutionId');

        for (const conf of conferences) {
            const ausCoAuthors = conf.coAuthors.filter(co =>
                (co.employeeId && co.employeeId !== '') ||
                (co.affiliation && co.affiliation.toLowerCase().includes('aditya'))
            );
            if (ausCoAuthors.length > 0) {
                // Build claimants directly from stored co-author data — no Employee DB lookup needed
                const coAuthorClaimants = ausCoAuthors.map(co => ({
                    name: co.name,
                    institutionId: co.employeeId || null
                }));

                const claimants = [
                    { name: conf.facultyId.name, institutionId: conf.facultyId.institutionId },
                    ...coAuthorClaimants
                ];
                const uniqueClaimants = claimants.filter((v, i, a) =>
                    a.findIndex(t => (v.institutionId && t.institutionId === v.institutionId) || (!v.institutionId && t.name === v.name)) === i
                );

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

        // 6, 7, 8: Funded Projects, Consultancy, and Novel Product are automatically resolved as all AUS investigators receive points.

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

// @desc    Update Proctoring Duties option (Yes/No) for Appraisal
// @route   POST /api/appraisal/proctoring-duties
// @access  Private (Faculty)
exports.updateProctoringDuties = async (req, res) => {
    try {
        const { academicYearId, hasProctoringDuties } = req.body;
        const facultyId = req.user.userId;

        if (!academicYearId || !["Yes", "No"].includes(hasProctoringDuties)) {
            return res.status(400).json({ success: false, message: "Invalid request parameters." });
        }

        let appraisal = await Appraisal.findOne({ facultyId, academicYearId });
        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal draft not found. Please initiate first." });
        }

        if (appraisal.status !== "Draft" && appraisal.status !== "Rejected by HOD") {
            return res.status(400).json({ success: false, message: "Appraisal has already been submitted." });
        }

        // Save the selection
        appraisal.teaching.proctoring.hasProctoringDuties = hasProctoringDuties;

        if (hasProctoringDuties === "No") {
            // If No, clear entries and averagePoints
            appraisal.teaching.proctoring.entries = [];
            appraisal.teaching.proctoring.averagePoints = 0;
        } else {
            // If Yes, pull live proctoring entries and calculate
            const config = await AppraisalConfig.findOne({ academicYearId });
            const activeConfig = config || { teaching: { proctoringPoints: DEFAULT_CONFIG.teaching.proctoringPoints } };

            const proctoringEntries = await FacultyProctoringEntry.find({ facultyId, academicYear: academicYearId })
                .populate("programId", "name code programPattern")
                .populate("branchId", "name code");

            const proctoringItems = [];
            let totalProctorPoints = 0;

            for (const entry of proctoringEntries) {
                const procPoints = getPointsFromRanges(entry.passPercentage, activeConfig.teaching.proctoringPoints || DEFAULT_CONFIG.teaching.proctoringPoints);
                proctoringItems.push({
                    programId: entry.programId?._id,
                    programCode: entry.programId?.code,
                    branchId: entry.branchId?._id,
                    branchCode: entry.branchId?.code,
                    semesterNumber: entry.semesterNumber,
                    yearNumber: entry.yearNumber,
                    section: entry.section,
                    totalStudents: entry.totalStudents || 0,
                    appeared: entry.eligibleStudents || 0,
                    passed: entry.passedStudents || 0,
                    percentage: entry.passPercentage || 0,
                    pointsClaimed: procPoints
                });
                totalProctorPoints += procPoints;
            }

            const proctoringAverage = proctoringItems.length > 0 ? Number((totalProctorPoints / proctoringItems.length).toFixed(2)) : 0;
            appraisal.teaching.proctoring.entries = proctoringItems;
            appraisal.teaching.proctoring.averagePoints = proctoringAverage;
        }

        // Recalculate teaching totals
        const ppAverage = appraisal.teaching.passPercentage?.averagePoints || 0;
        const feedbackAverage = appraisal.teaching.feedback?.averagePoints || 0;
        const proctoringAverage = appraisal.teaching.proctoring?.averagePoints || 0;
        const coAverage = appraisal.teaching.coAttainment?.averagePoints || 0;

        const teachingMax = appraisal.personalInfoSnapshot?.hasCos !== false ? 80 : 60;
        appraisal.teaching.totalClaimed = Math.min(teachingMax, Number((ppAverage + feedbackAverage + proctoringAverage + coAverage).toFixed(2)));

        await appraisal.save();
        res.json({ success: true, message: "Proctoring duties response saved.", data: appraisal });
    } catch (err) {
        console.error("Save Proctoring Duties Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SCOPUS HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const SCOPUS_API_KEY = process.env.SCOPUS_API_KEY;
const SCOPUS_SEARCH_BASE = "https://api.elsevier.com/content/search/scopus";

/**
 * Fetches all papers for an author in a given date range.
 * Handles pagination automatically (25 per page — safe for institutional keys).
 * @param {string} authorId  - Scopus Author ID
 * @param {string} dateRange - e.g. "2025" or "1900-2024"
 * @returns {Promise<Array>} - array of entry objects with citedby-count
 */
async function scopusFetchAllPapers(authorId, dateRange) {
    const allEntries = [];
    let start = 0;
    const count = 25;

    while (true) {
        const params = new URLSearchParams({
            query: `AU-ID(${authorId})`,
            date: dateRange,
            count,
            start,
            field: "citedby-count",
            sort: "citedby-count",
            apiKey: SCOPUS_API_KEY,
            httpAccept: "application/json"
        });

        const response = await fetch(`${SCOPUS_SEARCH_BASE}?${params.toString()}`);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Scopus API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const sr = data["search-results"] || {};
        const total = parseInt(sr["opensearch:totalResults"] || "0");
        const entries = sr["entry"] || [];

        // Guard: empty result set
        if (!entries.length || entries[0]?.error) break;

        allEntries.push(...entries);
        if (start + count >= total) break;
        start += count;
    }

    return allEntries;
}

/**
 * Computes h-index from an array of Scopus paper entries.
 * h-index = largest h where h papers each have >= h citations.
 */
function computeHIndex(entries) {
    const citations = entries
        .map(e => parseInt(e["citedby-count"] || "0"))
        .sort((a, b) => b - a);

    let h = 0;
    for (let i = 0; i < citations.length; i++) {
        if (citations[i] >= i + 1) h = i + 1;
        else break;
    }
    return h;
}

/**
 * Computes appraisal points for h-index raise based on rules:
 *   h ≤ 5  → 1 pt per step
 *   5 < h ≤ 10 → 2 pts per step
 *   h > 10 → 4 pts per step
 */
function computeHIndexPoints(hPrev, hNew, hRateLow = 1, hRateMid = 2, hRateHigh = 4) {
    if (hNew <= hPrev) return 0;
    const raise = hNew - hPrev;
    let rate = 0;
    if (hNew < 5) {
        rate = hRateLow;
    } else if (hNew >= 5 && hNew <= 10) {
        rate = hRateMid;
    } else {
        rate = hRateHigh;
    }
    return raise * rate;
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Fetch Scopus citation & h-index data for a faculty member
// @route   GET /api/appraisal/scopus-data/:academicYearId
// @access  Private (Faculty)
// ─────────────────────────────────────────────────────────────────────────────
exports.getScopusData = async (req, res) => {
    try {
        const { academicYearId } = req.params;
        let facultyId = req.user.userId;
        if (req.query.facultyId && ["ADMIN", "RESEARCH_DEAN", "RESEARCH_COORDINATOR", "DEPARTMENT HOD", "HOD"].includes(req.user.role)) {
            facultyId = req.query.facultyId;
        }

        // Get faculty and their Scopus ID
        const faculty = await Employee.findById(facultyId).select("name scopusId institutionId");
        if (!faculty) {
            return res.status(404).json({ success: false, message: "Faculty not found." });
        }

        const empid = faculty.institutionId;
        const scopusId = faculty.scopusId || "";

        // Get appraisal config for citation/hindex rates
        const config = await AppraisalConfig.findOne({ academicYearId });
        const citationRate = config?.research?.citationRate ?? 0.2;
        const hRateLow = config?.research?.hIndexRateLow ?? 1;
        const hRateMid = config?.research?.hIndexRateMid ?? 2;
        const hRateHigh = config?.research?.hIndexRateHigh ?? 4;

        const AcademicYear = require('../academicYear/academicYear.model');
        const acYearDoc = await AcademicYear.findById(academicYearId);
        const acYearString = acYearDoc ? acYearDoc.year : "2025-2026";
        const startYear = Number(acYearString.split('-')[0]) || 2025;
        const previousYear = startYear - 1;
        const currentYear = startYear;

        // Fetch from our new AuthorCitations model instead of Scopus API
        const AuthorCitations = require('../AuthorCitations/AuthorCitations.model');
        const authorCitationsDoc = await AuthorCitations.findOne({ empid });

        let citationsCurrentYear = 0;
        let hIndexPrevYear = 0;
        let hIndexCurrentYear = 0;

        if (authorCitationsDoc) {
            citationsCurrentYear = (authorCitationsDoc.citations && authorCitationsDoc.citations.get)
                ? (authorCitationsDoc.citations.get(String(currentYear)) || 0)
                : (authorCitationsDoc.citations?.[String(currentYear)] || 0);

            hIndexPrevYear = (authorCitationsDoc.hIndex && authorCitationsDoc.hIndex.get)
                ? (authorCitationsDoc.hIndex.get(String(previousYear)) || 0)
                : (authorCitationsDoc.hIndex?.[String(previousYear)] || 0);

            hIndexCurrentYear = (authorCitationsDoc.hIndex && authorCitationsDoc.hIndex.get)
                ? (authorCitationsDoc.hIndex.get(String(currentYear)) || 0)
                : (authorCitationsDoc.hIndex?.[String(currentYear)] || 0);
        }

        // ── Score Calculation ──────────────────────────────────
        const citationScore = Math.round(citationsCurrentYear * citationRate * 10) / 10;
        const hIndexRaise = Math.max(0, hIndexCurrentYear - hIndexPrevYear);
        const hIndexPoints = computeHIndexPoints(hIndexPrevYear, hIndexCurrentYear, hRateLow, hRateMid, hRateHigh);

        // ── Save to Appraisal document ─────────────────────────
        const appraisal = await Appraisal.findOne({ facultyId, academicYearId });
        if (appraisal) {
            const isEvaluator = ["ADMIN", "RESEARCH_DEAN", "RESEARCH_COORDINATOR", "DEPARTMENT HOD", "HOD"].includes(req.user.role);
            if (appraisal.status === "Draft" || appraisal.status === "Rejected by HOD" || isEvaluator) {
                appraisal.research.scopusCitations = citationsCurrentYear;
                appraisal.research.hIndexPrevYear = hIndexPrevYear;
                appraisal.research.hIndexCurrentYear = hIndexCurrentYear;
                appraisal.research.scopusCitationScore = citationScore;
                appraisal.research.scopusHIndexScore = hIndexPoints;

                // Recalculate total research points
                const paperPts = appraisal.research.papers?.totalClaimed || 0;
                const phdPts = appraisal.research.phdGuiding?.totalClaimed || 0;
                const bookPts = appraisal.research.booksChapters?.totalClaimed || 0;
                const patentPts = appraisal.research.patents?.totalClaimed || 0;
                const novelPts = appraisal.research.novelProducts?.totalClaimed || 0;
                const projPts = appraisal.research.projectsConsultancies?.totalClaimed || 0;

                const citationScoreFinal = (appraisal.research.scopusCitationStatus === "Approved" || appraisal.status === "Draft" || appraisal.status === "Rejected by HOD") ? citationScore : 0;
                const hIndexPointsFinal = (appraisal.research.scopusHIndexStatus === "Approved" || appraisal.status === "Draft" || appraisal.status === "Rejected by HOD") ? hIndexPoints : 0;

                appraisal.research.totalClaimed = Number((
                    paperPts + phdPts + bookPts + patentPts + novelPts + projPts +
                    citationScoreFinal + hIndexPointsFinal
                ).toFixed(2));

                await appraisal.save();
            }
        }

        return res.json({
            success: true,
            data: {
                scopusId,
                citationsCurrentYear,
                hIndexPrevYear,
                hIndexCurrentYear,
                hIndexRaise,
                scores: {
                    citationScore,
                    hIndexPoints,
                    total: Math.round((citationScore + hIndexPoints) * 10) / 10
                },
                ratesUsed: {
                    citationRate,
                    hRateLow,
                    hRateMid,
                    hRateHigh
                }
            }
        });

    } catch (err) {
        console.error("Scopus Data Fetch Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};// --- UNIPRIME All Appraisals ---
exports.getAllAppraisals = async (req, res) => {
    try {
        const { academicYearId } = req.params;

        // Ensure academic year exists
        const academicYear = await AcademicYear.findById(academicYearId);
        if (!academicYear) {
            return res.status(404).json({ success: false, message: "Academic Year not found." });
        }

        let userRolesExtracted = (req.user.roles || []).flatMap(r => {
            const roleName = (r.role?.name || '').toUpperCase().trim();
            const roleKey = (r.role?.key || '').toUpperCase().trim();
            const roleDirect = (typeof r === 'string' ? r : (typeof r.role === 'string' ? r.role : '')).toUpperCase().trim();
            return [roleName, roleKey, roleDirect].filter(Boolean);
        });

        const isUniprime = userRolesExtracted.includes("UNIPRIME");
        const hasDeanIQAC = userRolesExtracted.includes("DEAN_IQAC") || userRolesExtracted.includes("DEAN - (IQAC)");
        const hasDeanAdmissions = userRolesExtracted.includes("DEAN_ADMISSIONS") || userRolesExtracted.includes("DEAN - (ADMISSIONS)");

        const isOtherLeadership = userRolesExtracted.some(role => [
            "VICE CHANCELLOR", "DY. PRO CHANCELLOR", "REGISTRAR",
            "PRO VICE-CHANCELLOR (ENGG.&SCI.)", "PRO VICE CHANCELLOR (ENGG.&SCI.)", "PRO_VICE_CHANCELLOR_E_S", "PRO VICE-CHANCELLOR (E & S)",
            "PRO VICE-CHANCELLOR (A)", "PRO_VICE_CHANCELLOR_A",
            "PRO VICE-CHANCELLOR (S & P)", "PRO_VICE_CHANCELLOR_S_P"
        ].includes(role));

        let query = { academicYearId };

        if (!isUniprime && !isOtherLeadership) {
            if (hasDeanIQAC && !hasDeanAdmissions) {
                query.status = { $in: ["Submitted to Dean - (IQAC)", "Approved by Dean - (IQAC)", "Rejected by Dean - (IQAC)"] };
            } else if (hasDeanAdmissions && !hasDeanIQAC) {
                query.status = { $in: ["Submitted to Dean - (Admissions)", "Approved by Dean - (Admissions)", "Rejected by Dean - (Admissions)"] };
            } else if (hasDeanIQAC && hasDeanAdmissions) {
                query.status = { $in: [
                    "Submitted to Dean - (IQAC)", "Approved by Dean - (IQAC)", "Rejected by Dean - (IQAC)",
                    "Submitted to Dean - (Admissions)", "Approved by Dean - (Admissions)", "Rejected by Dean - (Admissions)"
                ]};
            }
        }

        const appraisals = await Appraisal.find(query)
            .populate({
                path: 'facultyId',
                select: 'name email phone institutionId designation profileImage department coreDepartment qualification leadership',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'coreDepartment', select: 'name' }
                ]
            })
            .populate('valueAddition.resourceUtilization.items.eventId')
            .populate({
                path: 'valueAddition.expertiseContribution.items.contributionId',
                populate: { path: 'category' }
            })
            .sort({ updatedAt: -1 });

        const config = await AppraisalConfig.findOne({ academicYearId });
        const appraisalsObj = appraisals.map(app => {
            const appObj = app.toObject();
            return attachEligibilityInfo(appObj, config);
        });

        res.json({
            success: true,
            data: appraisalsObj
        });
    } catch (err) {
        console.error("Get All Appraisals Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- Get Appraisal by ID ---
exports.getAppraisalById = async (req, res) => {
    try {
        const { id } = req.params;
        const appraisal = await Appraisal.findById(id).populate({
            path: 'facultyId',
            select: 'name email phone institutionId designation profileImage department coreDepartment qualification leadership',
            populate: [
                { path: 'department', select: 'name' },
                { path: 'coreDepartment', select: 'name' }
            ]
        }).populate('research.novelProducts.items.productId')
            .populate('valueAddition.resourceUtilization.items.eventId')
            .populate({
                path: 'valueAddition.expertiseContribution.items.contributionId',
                populate: { path: 'category' }
            });

        if (!appraisal) {
            return res.status(404).json({ success: false, message: "Appraisal not found." });
        }

        // Security check for FACULTY role
        let userRoles = (req.user.roles || []).flatMap(r => {
            const roleName = (r.role?.name || '').toUpperCase().trim();
            const roleKey = (r.role?.key || '').toUpperCase().trim();
            const roleDirect = (typeof r === 'string' ? r : (typeof r.role === 'string' ? r.role : '')).toUpperCase().trim();
            return [roleName, roleKey, roleDirect].filter(Boolean);
        });

        // Normalize roles that might have different naming conventions in the token
        userRoles = userRoles.map(role => {
            if (role === "PRO VICE-CHANCELLOR (ENGG.&SCI.)" || role === "PRO VICE CHANCELLOR (ENGG.&SCI.)" || role === "PRO_VICE_CHANCELLOR_E_S") {
                return "PRO VICE-CHANCELLOR (E & S)";
            }
            if (role === "VICE_CHANCELLOR") return "VICE CHANCELLOR";
            if (role === "DY_PRO_CHANCELLOR") return "DY. PRO CHANCELLOR";
            if (role === "DEAN_IQAC") return "DEAN - (IQAC)";
            if (role === "DEAN_ADMISSIONS") return "DEAN - (ADMISSIONS)";
            return role;
        });

        const isFaculty = userRoles.includes("FACULTY");
        const higherRoles = [
            "UNIPRIME", "ADMIN", "PRINCIPAL", "DEPARTMENT HOD", "HOD", "SCHOOL DEAN", "SCHOOL_DEAN",
            "VICE CHANCELLOR", "DY. PRO CHANCELLOR", "REGISTRAR",
            "PRO VICE-CHANCELLOR (E & S)", "PRO VICE-CHANCELLOR (A)", "PRO VICE-CHANCELLOR (S & P)",
            "DEAN - (IQAC)", "DEAN - (ADMISSIONS)", "DEAN"
        ];
        const isHigherRole = userRoles.some(r => higherRoles.includes(r));

        if (isFaculty && !isHigherRole) {
            const facultyIdStr = appraisal.facultyId?._id?.toString() || appraisal.facultyId?.toString();
            if (facultyIdStr !== req.user.userId.toString()) {
                return res.status(403).json({ success: false, message: "Access denied. You can only view your own appraisal." });
            }
        }

        // Fetch related details
        const facultyId = appraisal.facultyId?._id || appraisal.facultyId;

        const academicYearId = appraisal.academicYearId;

        const proctoringEntries = await FacultyProctoringEntry.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } })
            .populate("programId", "name code programPattern")
            .populate("branchId", "name code");
        const resourceUt = await ResourceUtilization.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } });
        const contributions = await Contribution.find({ facultyId, academicYear: academicYearId, removedFromAppraisal: { $ne: true } }).populate("category");
        const adminRoles = await FacultyAdministration.findOne({ facultyId, academicYear: academicYearId });

        const appObj = appraisal.toObject();
        appObj.proctoringDetail = proctoringEntries;
        appObj.proctoringDetails = proctoringEntries;
        appObj.resourceUtilizationDetails = resourceUt;
        appObj.contributionDetails = contributions;
        appObj.administrationDetail = adminRoles;

        const config = await AppraisalConfig.findOne({ academicYearId });
        attachEligibilityInfo(appObj, config);

        res.json({
            success: true,
            data: appObj
        });
    } catch (err) {
        console.error("Get Appraisal By ID Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- Get Active Appraisal Year ---
exports.getActiveAppraisalYear = async (req, res) => {
    try {
        const activeConfig = await AppraisalConfig.findOne({ isActive: true }).populate('academicYearId');
        res.json({
            success: true,
            data: activeConfig ? activeConfig.academicYearId : null
        });
    } catch (err) {
        console.error("Get Active Appraisal Year Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- Get My Appraisals (Faculty List View) ---
exports.getMyAppraisals = async (req, res) => {
    try {
        const facultyId = req.user.userId;
        const faculty = await Employee.findById(facultyId);
        if (!faculty) {
            return res.status(404).json({ success: false, message: "Faculty not found." });
        }

        const appraisals = await Appraisal.find({ facultyId })
            .populate('academicYearId', 'year')
            .sort({ createdAt: -1 });

        const formattedAppraisals = await Promise.all(appraisals.map(async (app) => {
            const config = await AppraisalConfig.findOne({ academicYearId: app.academicYearId._id });

            const appObj = app.toObject();
            appObj.facultyId = faculty.toObject();
            const eligibleApp = attachEligibilityInfo(appObj, config);

            return {
                _id: app._id,
                academicYearId: app.academicYearId, // includes _id and year
                totalPointsGained: eligibleApp.eligibility?.totalObtained || (app.teaching?.totalClaimed || 0) + (app.research?.totalClaimed || 0) + (app.valueAddition?.totalClaimed || 0) + (app.administration?.totalClaimed || 0) + (app.hodEvaluation?.totalInterpersonalPoints || 0),
                minPointsRequired: eligibleApp.eligibility?.mins?.total || 0,
                eligibility: eligibleApp.eligibility,
                status: app.status,
                createdAt: app.createdAt
            };
        }));

        res.json({
            success: true,
            data: formattedAppraisals
        });

    } catch (err) {
        console.error("Get My Appraisals Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.generateAppraisalPDF = async (req, res) => {
    try {
        const { html } = req.body;
        if (!html) {
            return res.status(400).json({ success: false, message: "HTML content is required" });
        }

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Ensure background colors are printed by default
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '15mm',
                bottom: '15mm',
                left: '15mm',
                right: '15mm'
            }
        });

        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="appraisal_report.pdf"',
            'Content-Length': pdfBuffer.length
        });

        res.send(pdfBuffer);
    } catch (err) {
        console.error("Generate PDF Error:", err);
        res.status(500).json({ success: false, message: "Failed to generate PDF" });
    }
};

// 12. Generic Management Pending list
exports.getPendingManagementAppraisals = async (req, res) => {
    try {
        const Employee = require("../employee/employee.model");
        const userEmployee = await Employee.findById(req.user.userId);
        if (!userEmployee) return res.status(404).json({ success: false, message: "User not found" });

        let designation = (userEmployee.designation || "").trim();
        if (designation === "Pro Vice-Chancellor (Engg.&Sci.)" || designation === "Pro Vice Chancellor (Engg.&Sci.)") {
            designation = "Pro Vice-Chancellor (E & S)";
        }
        let allowedStatuses = [];

        // Extract user roles in uppercase for comparison
        let userRolesExtracted = (req.user.roles || []).flatMap(r => {
            const roleName = (r.role?.name || '').toUpperCase().trim();
            const roleKey = (r.role?.key || '').toUpperCase().trim();
            const roleDirect = (typeof r === 'string' ? r : (typeof r.role === 'string' ? r.role : '')).toUpperCase().trim();
            return [roleName, roleKey, roleDirect].filter(Boolean);
        });

        // Normalize roles
        userRolesExtracted = userRolesExtracted.map(role => {
            if (role === "PRO VICE-CHANCELLOR (ENGG.&SCI.)" || role === "PRO VICE CHANCELLOR (ENGG.&SCI.)" || role === "PRO_VICE_CHANCELLOR_E_S") {
                return "PRO VICE-CHANCELLOR (E & S)";
            }
            if (role === "VICE_CHANCELLOR") return "VICE CHANCELLOR";
            if (role === "DY_PRO_CHANCELLOR") return "DY. PRO CHANCELLOR";
            if (role === "DEAN_IQAC") return "DEAN - (IQAC)";
            if (role === "DEAN_ADMISSIONS") return "DEAN - (ADMISSIONS)";
            return role;
        });

        // Check for specific senior management roles
        const specificRoles = [
            "Vice Chancellor",
            "Dy. Pro Chancellor",
            "Registrar",
            "Pro Vice-Chancellor (E & S)",
            "Pro Vice-Chancellor (A)",
            "Pro Vice-Chancellor (S & P)",
            "Dean - (IQAC)",
            "Dean - (Admissions)"
        ];

        specificRoles.forEach(role => {
            if (userRolesExtracted.includes(role.toUpperCase())) {
                allowedStatuses.push(`Submitted to ${role}`);
                allowedStatuses.push(`Approved by ${role}`);
                allowedStatuses.push(`Rejected by ${role}`);
            }
        });

        // Check if they are a regular School Dean
        // Checking via roles catalog if available, or designation fallback
        const { ADMIN_ROLE_CATALOG } = require("../FacultyAdministration/adminRoleCatalog");
        const userRoles = (req.user.roles || []).map(r => r.role?.toUpperCase() || r.role || r);
        const isSchoolDean = userRoles.includes(ADMIN_ROLE_CATALOG.SCHOOL_DEAN) || designation.includes("Dean") || designation.includes("Associate Dean");

        if (isSchoolDean) {
            allowedStatuses.push("Submitted to Dean");
            allowedStatuses.push("Approved by Dean");
            allowedStatuses.push("Rejected by Dean");
        }

        if (allowedStatuses.length === 0) {
            return res.json({ success: true, data: [] });
        }

        let filter = { status: { $in: allowedStatuses } };

        // Ensure School Deans only see appraisals from their own schools
        if (isSchoolDean) {
            const { getHODDepartments } = require("../../utils/hodHelper");
            const deptIds = await getHODDepartments(req.user);

            const facultyIds = await Employee.find({
                $or: [
                    { coreDepartment: { $in: deptIds } },
                    { department: { $in: deptIds } }
                ]
            }).distinct('_id');

            const deanStatuses = ["Submitted to Dean", "Approved by Dean", "Rejected by Dean"];
            filter = {
                $or: [
                    { status: { $in: deanStatuses }, facultyId: { $in: facultyIds } },
                    { status: { $in: allowedStatuses.filter(s => !deanStatuses.includes(s)) } }
                ]
            };
        }

        const appraisals = await Appraisal.find(filter)
            .populate("facultyId", "name institutionId coreDepartment department doctorate leadership qualification")
            .populate("academicYearId", "year");

        res.json({ success: true, data: appraisals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 13. Generic Management Evaluation
exports.evaluateManagementAppraisal = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, comments, interpersonalRatings, totalInterpersonalPoints } = req.body; // 'Approve' or 'Reject'

        const appraisal = await Appraisal.findById(id);
        if (!appraisal) return res.status(404).json({ success: false, message: "Appraisal not found." });

        if (!appraisal.status.startsWith("Submitted to ")) {
            return res.status(400).json({ success: false, message: "Appraisal is not in a submittable state for management." });
        }

        if (appraisal.status === "Submitted to HOD") {
            return res.status(403).json({ success: false, message: "HOD evaluations must use the dedicated HOD endpoint." });
        }

        let roleName = appraisal.status.replace("Submitted to ", "");

        if (action === "Approve") {
            appraisal.status = `Approved by ${roleName}`;

            const facultyId = appraisal.facultyId;
            const academicYearId = appraisal.academicYearId;
            const ResourceUtilization = require("../ResourceUtilization/ResourceUtilization.model");
            const Contribution = require("../Contribution/Contribution.model");
            const FacultyAdministration = require("../FacultyAdministration/FacultyAdministration.model");

            // Promote "Approved by HOD" entries to "Approved"
            await ResourceUtilization.updateMany(
                { facultyId, academicYear: academicYearId, status: "Approved by HOD" },
                { $set: { status: "Approved" } }
            );

            await Contribution.updateMany(
                { facultyId, academicYear: academicYearId, status: "Approved by HOD" },
                { $set: { status: "Approved" } }
            );

            await FacultyAdministration.updateMany(
                { facultyId, academicYear: academicYearId, status: "Approved by HOD" },
                { $set: { status: "Approved", "roles.$[elem].status": "Approved" } },
                { arrayFilters: [{ "elem.status": "Approved by HOD" }] }
            );
        } else if (action === "Reject") {
            appraisal.status = `Rejected by ${roleName}`;

            if (!appraisal.rejectionHistory) appraisal.rejectionHistory = [];
            appraisal.rejectionHistory.push({
                role: roleName === "Dean" ? "SCHOOL_DEAN" : roleName,
                roleLabel: roleName,
                comments,
                date: new Date(),
                evaluatedBy: req.user.userId
            });

            // Revert any "Pending", "Pending at HOD", or "Approved by HOD" sections to "Draft" to allow corrections
            const facultyId = appraisal.facultyId;
            const academicYearId = appraisal.academicYearId;
            const ResourceUtilization = require("../ResourceUtilization/ResourceUtilization.model");
            const Contribution = require("../Contribution/Contribution.model");
            const FacultyAdministration = require("../FacultyAdministration/FacultyAdministration.model");

            await ResourceUtilization.updateMany(
                { facultyId, academicYear: academicYearId, status: { $in: ["Pending", "Pending at HOD", "Approved by HOD"] } },
                { $set: { status: "Draft" } }
            );

            await Contribution.updateMany(
                { facultyId, academicYear: academicYearId, status: { $in: ["Pending", "Pending at HOD", "Approved by HOD"] } },
                { $set: { status: "Draft" } }
            );

            await FacultyAdministration.updateMany(
                { facultyId, academicYear: academicYearId, status: { $in: ["Pending", "Approved by HOD"] } },
                { $set: { status: "Pending", "roles.$[].status": "Pending" } }
            );

            // Clear HOD Evaluation so they must re-evaluate and see the Dean's remarks upon resubmission
            appraisal.hodEvaluation = undefined;
        } else {
            return res.status(400).json({ success: false, message: "Invalid action." });
        }

        // If Management acted as the primary evaluator (HOD), save the Interpersonal Ratings
        if (interpersonalRatings && interpersonalRatings.length > 0) {
            appraisal.hodEvaluation = {
                interpersonalRatings,
                totalInterpersonalPoints: totalInterpersonalPoints || 0,
                comments: "",
                evaluatedBy: req.user.userId,
                evaluationDate: new Date()
            };
        }

        // Store comments inside a generic managementEvaluation object ONLY on Approve
        // On Reject, comments are already in rejectionHistory
        if (action === "Approve") {
            appraisal.managementEvaluation = {
                comments: comments || "",
                evaluatedBy: req.user.userId,
                evaluationDate: new Date()
            };
            appraisal.markModified('managementEvaluation');
        }

        await appraisal.save();
        res.json({ success: true, message: `Appraisal ${action}d successfully.`, data: appraisal });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
