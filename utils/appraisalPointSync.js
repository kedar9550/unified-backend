const Appraisal = require("../modules/Appraisal/Appraisal.model");
const ResourceUtilization = require("../modules/ResourceUtilization/ResourceUtilization.model");
const Contribution = require("../modules/Contribution/Contribution.model");
const FacultyAdministration = require("../modules/FacultyAdministration/FacultyAdministration.model");
const AppraisalConfig = require("../modules/Appraisal/AppraisalConfig.model");
const { ADMIN_ROLE_CATALOG } = require("../modules/FacultyAdministration/adminRoleCatalog");

function calculateResourceUtilizationPoints(r, config) {
    const resourceUtConf = config?.valueAddition?.resourceUtilizationPoints || {
        conference: 10, sttp: 10, fdp: 10, guestLecture: 2, resourcePerson: 2, participated: 1
    };
    let pts = 0;
    const activityRole = (r.activityType || '').toLowerCase();
    const activityCat = (r.activityCategory || '').toLowerCase();

    if (activityRole.includes('resource person') || activityRole.includes('resourceperson')) {
        pts = (parseInt(r.numberOfSessions) || parseInt(r.sessionsConducted) || 1) * (resourceUtConf.resourcePerson ?? 2);
    } else if (activityRole.includes('participant') || activityRole.includes('participated')) {
        // Use manually entered daysParticipated as authoritative; duration is auto-calculated fallback
        const participantDays = parseInt(r.numberOfDaysParticipated) || parseInt(r.daysParticipated) || Number(r.duration) || 1;
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
    
    return pts;
}

function calculateContributionPoints(item, config) {
    const expPointsConf = config?.valueAddition?.expertisePoints || {
        memberBOS: 5, editorialBoardSCIE: 5, editorialBoardESCI: 3, awardsGovt: 5, awardsOthers: 3,
        developedEContent: 10, certificationNewAge: 5, hackathonShortlisted: 5, newspaperArticle: 3,
        researchFacility: 3, nptel12W: 10, nptel8W: 8, nptel4W: 5, coursera: 5, grantSanctioned: 5
    };

    const cat = item.category?.code || parseInt(item.category) || 0;
    switch (cat) {
        case 1: return expPointsConf.memberBOS ?? 5;
        case 2: return expPointsConf.editorialBoardSCIE ?? 5;
        case 3: return expPointsConf.editorialBoardESCI ?? 3;
        case 4: return expPointsConf.awardsGovt ?? 5;
        case 5: return expPointsConf.awardsOthers ?? 3;
        case 6: return expPointsConf.developedEContent ?? 10;
        case 7: return expPointsConf.certificationNewAge ?? 5;
        case 8: return expPointsConf.hackathonShortlisted ?? 5;
        case 9: return expPointsConf.newspaperArticle ?? 3;
        case 10: return expPointsConf.researchFacility ?? 3;
        case 11:
            const dur = (item.duration || '').toLowerCase();
            if (dur.includes('12')) return expPointsConf.nptel12W ?? 10;
            if (dur.includes('8')) return expPointsConf.nptel8W ?? 8;
            if (dur.includes('4')) return expPointsConf.nptel4W ?? 5;
            return expPointsConf.nptel8W ?? 8;
        case 12: return expPointsConf.coursera ?? 5;
        case 13: return expPointsConf.grantSanctioned ?? 5;
        default: return 0;
    }
}

function calculateAdministrativePoints(r, config, ADMIN_ROLE_CATALOG) {
    const adminConf = config?.administration?.rolePoints || {
        deanCentral: 20, hodCentral: 15, hodDept: 15, dyHodDept: 10, timetableDept: 10,
        placementCentral: 10, placementDept: 10, courseraCentral: 10, courseraDept: 5,
        edcCentral: 10, edcDept: 5, courseDept: 5, websiteCentral: 10, nssCentral: 10,
        nssDept: 5, trainingCentral: 10, trainingDept: 5, drcDept: 5, antiRaggingCentral: 5,
        antiRaggingDept: 3, otherCentral: 10, otherDept: 5
    };

    if (!r.isResponsible || r.status === "Rejected") return 0;

    let pts = 5;
    const level = (r.level || '').toLowerCase();
    const isCentral = level.includes('central') || level.includes('institute');

    const catalogEntry = ADMIN_ROLE_CATALOG.find(c => c.roleId === r.roleId);

    if (catalogEntry) {
        const pg = catalogEntry.pointsGroup;
        const key = pg + (isCentral ? 'Central' : 'Dept');
        pts = adminConf[key] ?? pts;
    } else if (r.roleName && r.roleName.toLowerCase().startsWith('any other')) {
        pts = isCentral ? (adminConf.otherCentral ?? 10) : (adminConf.otherDept ?? 5);
    } else {
        pts = isCentral ? (adminConf.otherCentral ?? 10) : (adminConf.otherDept ?? 5);
    }
    return pts;
}

async function syncAppraisalTotals(facultyId, academicYearId) {
    try {
        const config = await AppraisalConfig.findOne({ academicYearId });
        if (!config) return;

        // Fetch valid Resource Utilization
        const resourceUt = await ResourceUtilization.find({ 
            facultyId, academicYear: academicYearId, status: { $ne: "Rejected" }, removedFromAppraisal: { $ne: true } 
        });

        // Fetch valid Contributions and populate category to get the code
        const contributions = await Contribution.find({ 
            facultyId, academicYear: academicYearId, status: { $ne: "Rejected" }, removedFromAppraisal: { $ne: true } 
        });

        // Fetch ContributionCategories to map manually
        const ContributionCategory = require('../modules/Contribution/ContributionCategory.model');
        const categories = await ContributionCategory.find({});
        const catMap = {};
        for(let c of categories) {
            catMap[c._id.toString()] = c;
        }

        // Map category objects manually
        for (let c of contributions) {
            if (c.category) {
                c.category = catMap[c.category.toString()] || c.category;
            }
        }

        // Fetch Administration Detail
        const adminDetail = await FacultyAdministration.findOne({ facultyId, academicYear: academicYearId });

        // Fetch existing Appraisal to preserve HOD overridden points
        const existingAppraisal = await Appraisal.findOne({ facultyId, academicYearId }).lean();
        const existingAwardedMap = {};
        if (existingAppraisal?.valueAddition?.resourceUtilization?.items) {
            for (const item of existingAppraisal.valueAddition.resourceUtilization.items) {
                if (item.awardedPoints !== undefined && item.awardedPoints !== null && item.eventId) {
                    existingAwardedMap[item.eventId.toString()] = item.awardedPoints;
                }
            }
        }

        let resUtilTotal = 0;
        let resUtilItems = [];
        for (const r of resourceUt) {
            const calculatedPts = calculateResourceUtilizationPoints(r, config);
            const pts = existingAwardedMap[r._id.toString()] !== undefined ? existingAwardedMap[r._id.toString()] : calculatedPts;
            resUtilTotal += pts;
            resUtilItems.push({
                eventId: r._id,
                event: r.organizationName || r.activityCategory || '',
                role: r.activityType || '',
                pointsClaimed: calculatedPts,
                awardedPoints: pts
            });
        }

        let contribTotal = 0;
        let contribItems = [];
        for (const c of contributions) {
            const pts = calculateContributionPoints(c, config);
            contribTotal += pts;
            contribItems.push({
                contributionId: c._id,
                activityName: c.category?.name || '',
                pointsClaimed: pts
            });
        }

        let adminRaw = 0;
        let adminItems = [];
        if (adminDetail && adminDetail.roles) {
            const activeRoles = adminDetail.roles.filter(r => r.isResponsible && r.status !== 'Rejected');
            for (const r of activeRoles) {
                const pts = calculateAdministrativePoints(r, config, ADMIN_ROLE_CATALOG);
                adminRaw += pts;
                adminItems.push({
                    roleId: r.roleId,
                    activityName: r.roleName,
                    level: r.level,
                    pointsClaimed: pts
                });
            }
        }

        const cappedResUtil = Math.min(10, resUtilTotal);
        const cappedContrib = Math.min(10, contribTotal);
        const V = cappedResUtil + cappedContrib;
        const A = Math.min(20, adminRaw);

        await Appraisal.updateOne(
            { facultyId, academicYearId },
            {
                $set: {
                    "valueAddition.resourceUtilization.items": resUtilItems,
                    "valueAddition.resourceUtilization.totalClaimed": cappedResUtil,
                    "valueAddition.expertiseContribution.items": contribItems,
                    "valueAddition.expertiseContribution.totalClaimed": cappedContrib,
                    "valueAddition.totalClaimed": V,
                    "administration.items": adminItems,
                    "administration.totalClaimed": A
                }
            }
        );
        
        console.log(`[AppraisalSync] Successfully synced totals for faculty ${facultyId}, academicYear ${academicYearId}`);
    } catch (err) {
        console.error("[AppraisalSync] Error syncing appraisal totals:", err);
    }
}

module.exports = {
    syncAppraisalTotals,
    calculateResourceUtilizationPoints,
    calculateContributionPoints,
    calculateAdministrativePoints
};
