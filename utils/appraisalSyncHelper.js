const mongoose = require("mongoose");
const Appraisal = require("../modules/Appraisal/Appraisal.model");

/**
 * Sync appraisal status when Contribution records are rejected by HOD.
 * Matches by: valueAddition.expertiseContribution.items[].contributionId
 *
 * @param {Array<string|ObjectId>} rejectedRecordIds - The IDs of the rejected Contribution records
 */
async function syncAppraisalOnContributionRejection(rejectedRecordIds) {
    try {
        if (!rejectedRecordIds || rejectedRecordIds.length === 0) return;

        const objectIds = rejectedRecordIds.map(id =>
            typeof id === "string" ? new mongoose.Types.ObjectId(id) : id
        );

        // Find appraisals that are "Submitted to HOD" AND contain any of the rejected contribution IDs
        const result = await Appraisal.updateMany(
            {
                status: "Submitted to HOD",
                "valueAddition.expertiseContribution.items.contributionId": { $in: objectIds }
            },
            { $set: { status: "Rejected by HOD" } }
        );

        if (result.modifiedCount > 0) {
            console.log(`[AppraisalSync] ${result.modifiedCount} appraisal(s) moved to "Rejected by HOD" due to contribution rejection.`);
        }
    } catch (err) {
        console.error("[AppraisalSync] Error syncing appraisal on contribution rejection:", err);
    }
}

/**
 * Sync appraisal status when Resource Utilization records are rejected by HOD.
 * Matches by: valueAddition.resourceUtilization.items[].eventId
 *
 * @param {Array<string|ObjectId>} rejectedRecordIds - The IDs of the rejected ResourceUtilization records
 */
async function syncAppraisalOnResourceUtilizationRejection(rejectedRecordIds) {
    try {
        if (!rejectedRecordIds || rejectedRecordIds.length === 0) return;

        const objectIds = rejectedRecordIds.map(id =>
            typeof id === "string" ? new mongoose.Types.ObjectId(id) : id
        );

        const result = await Appraisal.updateMany(
            {
                status: "Submitted to HOD",
                "valueAddition.resourceUtilization.items.eventId": { $in: objectIds }
            },
            { $set: { status: "Rejected by HOD" } }
        );

        if (result.modifiedCount > 0) {
            console.log(`[AppraisalSync] ${result.modifiedCount} appraisal(s) moved to "Rejected by HOD" due to resource utilization rejection.`);
        }
    } catch (err) {
        console.error("[AppraisalSync] Error syncing appraisal on resource utilization rejection:", err);
    }
}

/**
 * Sync appraisal status when Administration roles are rejected by HOD.
 * Matches by: facultyId + academicYearId + administration.items[].activityName === roleName
 *
 * @param {string|ObjectId} facultyId - The faculty's ID
 * @param {string|ObjectId} academicYearId - The academic year's ID
 * @param {Array<string>} rejectedRoleNames - The roleName(s) that were rejected
 */
async function syncAppraisalOnAdministrationRejection(facultyId, academicYearId, rejectedRoleNames) {
    try {
        if (!facultyId || !academicYearId || !rejectedRoleNames || rejectedRoleNames.length === 0) return;

        const result = await Appraisal.updateMany(
            {
                facultyId: facultyId,
                academicYearId: academicYearId,
                status: "Submitted to HOD",
                "administration.items.activityName": { $in: rejectedRoleNames }
            },
            { $set: { status: "Rejected by HOD" } }
        );

        if (result.modifiedCount > 0) {
            console.log(`[AppraisalSync] ${result.modifiedCount} appraisal(s) moved to "Rejected by HOD" due to administration role rejection.`);
        }
    } catch (err) {
        console.error("[AppraisalSync] Error syncing appraisal on administration rejection:", err);
    }
}

/**
 * Sync appraisal status when Proctoring entries are rejected by HOD.
 * Matches by: facultyId + academicYearId + composite key (programId, branchId, semesterNumber, yearNumber, section)
 *
 * @param {Array<Object>} rejectedEntries - The rejected proctoring entry objects (must have facultyId, academicYear, programId, branchId, semesterNumber, yearNumber, section)
 */
async function syncAppraisalOnProctoringRejection(rejectedEntries) {
    try {
        if (!rejectedEntries || rejectedEntries.length === 0) return;

        // Group rejected entries by facultyId + academicYear for efficient querying
        const groupKey = (e) => `${e.facultyId}_${e.academicYear}`;
        const groups = {};
        for (const entry of rejectedEntries) {
            const key = groupKey(entry);
            if (!groups[key]) {
                groups[key] = { facultyId: entry.facultyId, academicYear: entry.academicYear, entries: [] };
            }
            groups[key].entries.push(entry);
        }

        let totalModified = 0;

        for (const group of Object.values(groups)) {
            // Find appraisals for this faculty + academic year that are "Submitted to HOD"
            const appraisals = await Appraisal.find({
                facultyId: group.facultyId,
                academicYearId: group.academicYear,
                status: "Submitted to HOD"
            });

            for (const appraisal of appraisals) {
                const proctoringEntries = appraisal.teaching?.proctoring?.entries || [];
                
                // Check if any rejected entry matches an appraisal proctoring entry
                const hasMatch = group.entries.some(rejected => {
                    return proctoringEntries.some(apprEntry => {
                        const programMatch = apprEntry.programId &&
                            apprEntry.programId.toString() === rejected.programId.toString();
                        const branchMatch = apprEntry.branchId &&
                            apprEntry.branchId.toString() === rejected.branchId.toString();
                        const semMatch = apprEntry.semesterNumber === rejected.semesterNumber;
                        const yearMatch = apprEntry.yearNumber === rejected.yearNumber;
                        const sectionMatch = apprEntry.section === rejected.section;

                        return programMatch && branchMatch && semMatch && yearMatch && sectionMatch;
                    });
                });

                if (hasMatch) {
                    appraisal.status = "Rejected by HOD";
                    await appraisal.save();
                    totalModified++;
                }
            }
        }

        if (totalModified > 0) {
            console.log(`[AppraisalSync] ${totalModified} appraisal(s) moved to "Rejected by HOD" due to proctoring rejection.`);
        }
    } catch (err) {
        console.error("[AppraisalSync] Error syncing appraisal on proctoring rejection:", err);
    }
}

module.exports = {
    syncAppraisalOnContributionRejection,
    syncAppraisalOnResourceUtilizationRejection,
    syncAppraisalOnAdministrationRejection,
    syncAppraisalOnProctoringRejection
};
