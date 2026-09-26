/**
 * Journal Incentive Calculator
 * Modular, configuration-driven research incentive calculation engine.
 */

const INCENTIVE_RULES = [
    {
        id: 'CAT_PREMIUM',
        name: 'IEEE Transactions / ASME / ASCE / ACM',
        match: (data, { ifVal, hiVal, quartile, category }) => {
            const premiumCats = ['IEEE', 'ASME', 'ASCE', 'ACM', 'IEEE TRANSACTIONS'];
            return premiumCats.includes(category);
        },
        baseAmount: 40000,
        agecRates: { 1: 3333, 2: 6667, 3: 10000 }
    },
    {
        id: 'Q1_HIGH',
        name: 'Q1 and (IF > 5.1 or HI > 201)',
        match: (data, { ifVal, hiVal, quartile }) => {
            return quartile === 'Q1' && (ifVal > 5.1 || hiVal > 201);
        },
        baseAmount: 24000,
        agecRates: { 1: 2000, 2: 4000, 3: 6000 }
    },
    {
        id: 'Q1_MID',
        name: 'Q1 and (1.1 < IF <= 5 or 101 < HI <= 200)',
        match: (data, { ifVal, hiVal, quartile }) => {
            return quartile === 'Q1' && ((ifVal > 1 && ifVal <= 5.1) || (hiVal > 100 && hiVal <= 201));
        },
        baseAmount: 20000,
        agecRates: { 1: 1666, 2: 3333, 3: 5000 }
    },
    {
        id: 'Q1_LOW',
        name: 'Q1 and (IF <= 1 or HI <= 100)',
        match: (data, { ifVal, hiVal, quartile }) => {
            return quartile === 'Q1' && (ifVal <= 1 || hiVal <= 100);
        },
        baseAmount: 16000,
        agecRates: { 1: 1333, 2: 2667, 3: 4000 }
    },
    {
        id: 'Q2_HIGH',
        name: 'Q2 and (IF > 2.1)',
        match: (data, { ifVal, quartile }) => {
            return quartile === 'Q2' && ifVal > 2.1;
        },
        baseAmount: 16000,
        agecRates: { 1: 1333, 2: 2667, 3: 4000 }
    },
    {
        id: 'Q2_MID',
        name: 'Q2 and (1.1 <= IF <= 2)',
        match: (data, { ifVal, quartile }) => {
            return quartile === 'Q2' && (ifVal > 1 && ifVal <= 2.1);
        },
        baseAmount: 12000,
        agecRates: { 1: 1000, 2: 2000, 3: 3000 }
    },
    {
        id: 'Q2_LOW',
        name: 'Q2 and (IF <= 1)',
        match: (data, { ifVal, quartile }) => {
            return quartile === 'Q2' && ifVal <= 1;
        },
        baseAmount: 9000,
        agecRates: { 1: 800, 2: 1600, 3: 2400 }
    },
    {
        id: 'SCOPUS_OR_WOS',
        name: 'Scopus or WoS',
        match: (data, { isScopus, isWos }) => {
            return isScopus === 'Yes' || isWos === 'Yes';
        },
        baseAmount: 8000,
        agecRates: { 1: 667, 2: 1333, 3: 2000 }
    }
];

/**
 * Get author percentage based on author position and corresponding author status
 * Rules:
 * - Authors up to 5th author eligible
 * - Corresponding author within positions 1-4 gets 100%
 * - Otherwise: Pos 1 = 100%, Pos 2 = 90%, Pos 3 = 80%, Pos 4 = 70%, Pos 5 = 60%, Pos 6+ = 0%
 */
const getAuthorPercentage = (position, isCorresponding) => {
    const pos = Number(position) || 1;
    const isCorr = String(isCorresponding || '').toLowerCase().trim() === 'yes' || isCorresponding === true;

    // Corresponding Author is eligible for 100% incentive
    if (isCorr) {
        return { percentage: 1.0, label: '100% (Corresponding Author)' };
    }

    switch (pos) {
        case 1:
            return { percentage: 1.0, label: '100% (1st Author)' };
        case 2:
            return { percentage: 0.90, label: '90% (2nd Author)' };
        case 3:
            return { percentage: 0.80, label: '80% (3rd Author)' };
        case 4:
            return { percentage: 0.70, label: '70% (4th Author)' };
        case 5:
            return { percentage: 0.60, label: '60% (5th Author)' };
        default:
            return { percentage: 0.0, label: '0% (Beyond 5th Author - Not Eligible)' };
    }
};

/**
 * Calculate AGEC Reference Bonus Amount
 */
const getAgecBonus = (numReferences, agecRates) => {
    const count = Number(numReferences) || 0;
    if (count <= 0 || !agecRates) return 0;
    if (count === 1) return agecRates[1] || 0;
    if (count === 2) return agecRates[2] || 0;
    return agecRates[3] || 0; // 3 or more papers
};

/**
 * Main Calculator Function
 * @param {Object} journalData
 * @returns {Object} result
 */
const calculateJournalIncentive = (journalData = {}) => {
    const applyIncentive = (journalData.applyIncentive || '').trim();

    if (applyIncentive !== 'Yes' && applyIncentive !== 'yes') {
        return {
            success: true,
            isEligible: false,
            estimatedIncentiveAmount: 0,
            baseAmount: 0,
            authorPercentage: 0,
            authorPercentageLabel: 'N/A',
            agecBonus: 0,
            matchedRule: null,
            breakdown: 'Incentive not applied'
        };
    }

    // Check student involvement - PG student disqualifies
    const isStudentsInvolved = journalData.isStudentsInvolved === 'Yes';
    let hasPgStudent = false;
    if (isStudentsInvolved && Array.isArray(journalData.coAuthors)) {
        hasPgStudent = journalData.coAuthors.some(
            ca => ca.CoAuthorType === 'student' && (ca.studentQualification || '').toUpperCase() === 'PG'
        );
    }
    if (hasPgStudent) {
        return {
            success: true,
            isEligible: false,
            estimatedIncentiveAmount: 0,
            baseAmount: 0,
            authorPercentage: 0,
            authorPercentageLabel: '0% (PG Student Involved)',
            agecBonus: 0,
            matchedRule: null,
            breakdown: 'Incentive is not applicable for publications with PG student co-authors.'
        };
    }

    // Missing mandatory parameter validations
    const missing = [];
    if (!journalData.userAuthorPosition && !journalData.facultyAuthorPosition) {
        missing.push('Author Position');
    }
    if (!journalData.journalQuartile) {
        missing.push('Journal Quartile');
    }

    if (missing.length > 0) {
        return {
            success: false,
            message: `Missing mandatory parameter(s) for incentive calculation: ${missing.join(', ')}`,
            missingFields: missing,
            estimatedIncentiveAmount: 0
        };
    }

    const pos = Number(journalData.userAuthorPosition || journalData.facultyAuthorPosition || 1);
    const isCorr = journalData.correspondingAuthor || 'No';
    const quartile = (journalData.journalQuartile || 'None').toUpperCase().trim();
    const category = (journalData.journalCategory || 'OTHERS').toUpperCase().trim();
    const ifVal = parseFloat(journalData.jcrImpactFactor || journalData.impactFactor || 0) || 0;
    const hiVal = parseInt(journalData.hIndex || 0, 10) || 0;
    const isScopus = (journalData.isScopus || 'No').trim();
    const isWos = (journalData.isWos || (journalData.journalType && journalData.journalType !== 'None' ? 'Yes' : 'No')).trim();
    const numAgecRefs = Number(journalData.numberOfReferencesBelongingToAGEC || 0);

    // 1. Author Percentage & Eligibility Check
    const { percentage: authorPercentage, label: authorLabel } = getAuthorPercentage(pos, isCorr);

    // If author is beyond 5th position and not corresponding author, not eligible for any incentive
    if (authorPercentage <= 0) {
        return {
            success: true,
            isEligible: false,
            estimatedIncentiveAmount: 0,
            baseAmount: 0,
            baseShare: 0,
            authorPercentage: 0,
            authorPercentageLabel: authorLabel,
            agecBonus: 0,
            numAgecRefs,
            matchedRule: null,
            breakdown: `Author Position ${pos} is beyond the 5th author. Research incentive is not applicable.`
        };
    }

    // 2. Find Matched Category Rule
    const matchContext = { ifVal, hiVal, quartile, category, isScopus, isWos };
    let matchedRule = INCENTIVE_RULES.find(rule => rule.match(journalData, matchContext));

    if (!matchedRule) {
        return {
            success: true,
            isEligible: false,
            estimatedIncentiveAmount: 0,
            baseAmount: 0,
            authorPercentage,
            authorPercentageLabel: authorLabel,
            agecBonus: 0,
            matchedRule: null,
            breakdown: 'Journal does not qualify under Scopus/WoS or eligible quartile categories.'
        };
    }

    // 3. Compute Base Incentive with Author Multiplier
    const base100 = matchedRule.baseAmount;
    const baseShare = Math.round(base100 * authorPercentage);

    // 4. Compute AGEC References Bonus
    const agecBonus = getAgecBonus(numAgecRefs, matchedRule.agecRates);

    // 5. Total Estimated Incentive
    const totalEstimated = baseShare + agecBonus;

    const breakdown = `[${matchedRule.name}] Base ₹${base100.toLocaleString('en-IN')} × ${(authorPercentage * 100)}% (₹${baseShare.toLocaleString('en-IN')}) + AGEC Ref (${numAgecRefs} Paper${numAgecRefs === 1 ? '' : 's'}): ₹${agecBonus.toLocaleString('en-IN')} = Total ₹${totalEstimated.toLocaleString('en-IN')}`;

    return {
        success: true,
        isEligible: totalEstimated > 0,
        estimatedIncentiveAmount: totalEstimated,
        baseAmount: base100,
        baseShare,
        authorPercentage,
        authorPercentageLabel: authorLabel,
        agecBonus,
        numAgecRefs,
        matchedRule: {
            id: matchedRule.id,
            name: matchedRule.name
        },
        breakdown
    };
};

module.exports = {
    INCENTIVE_RULES,
    getAuthorPercentage,
    getAgecBonus,
    calculateJournalIncentive
};
