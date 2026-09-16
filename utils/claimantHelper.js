const Employee = require('../modules/employee/employee.model');

/**
 * Resolves a list of co-authors / co-inventors to find their Employee _id from their staff code (employeeId)
 * and determines if there are multiple Aditya University (AUS) authors.
 * 
 * @param {Array} authorsList - List of co-authors/co-inventors from payload
 * @param {string} applicantId - Employee ObjectId of the applicant
 * @returns {Object} { resolvedAuthors, hasOtherAusAuthors }
 */
async function resolveCoAuthorsAndClaims(authorsList, applicantId) {
    const resolvedAuthors = [];
    let hasOtherAusAuthors = false;

    if (!Array.isArray(authorsList)) {
        return { resolvedAuthors: [], hasOtherAusAuthors: false };
    }

    for (const author of authorsList) {
        const authorCopy = { ...author };
        
        // Check if there is an employeeId (staff code like 5741)
        const staffCode = author.employeeId || author.empId;
        const isAusAffiliation = author.affiliationType === 'Aditya University' || 
            author.affiliationType === 'AUS' ||
            (author.affiliation && author.affiliation.toLowerCase().includes('aditya'));

        if (staffCode && isAusAffiliation) {
            // Store empId string directly — no DB lookup needed
            // Always mark hasOtherAusAuthors = true for AUS co-authors
            authorCopy.employeeId = String(staffCode).trim();
            hasOtherAusAuthors = true;
        } else if (isAusAffiliation) {
            // AUS affiliation but no empId provided → still flag as multi-AUS
            hasOtherAusAuthors = true;
            authorCopy.employeeId = null;
        } else {
            authorCopy.employeeId = null;
        }
        
        resolvedAuthors.push(authorCopy);
    }

    return { resolvedAuthors, hasOtherAusAuthors };
}

/**
 * Computes the default claimant based on other AUS authors presence.
 * If appraisalEligible is explicitly 'No', always returns null — no claimant should be assigned.
 * 
 * @param {boolean} hasOtherAusAuthors 
 * @param {string} applicantId 
 * @param {string|null} appraisalEligible - 'Yes', 'No', or null (unknown at submit time for self-entry)
 * @returns {string|null} Claimant ID or null
 */
async function getDefaultClaimant(hasOtherAusAuthors, applicantId, appraisalEligible = null) {
    // If appraisal is explicitly marked not eligible, never assign a claimant
    if (appraisalEligible === 'No' || appraisalEligible === 'no') {
        return null;
    }
    if (!hasOtherAusAuthors) {
        const employee = await Employee.findById(applicantId);
        return employee ? employee.institutionId : null;
    }
    return null;
}

module.exports = {
    resolveCoAuthorsAndClaims,
    getDefaultClaimant
};
