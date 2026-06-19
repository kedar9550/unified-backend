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
 * 
 * @param {boolean} hasOtherAusAuthors 
 * @param {string} applicantId 
 * @returns {string|null} Claimant ID or null if requires selection
 */
async function getDefaultClaimant(hasOtherAusAuthors, applicantId) {
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
