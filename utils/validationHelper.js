/**
 * Backend helper for date and year/month validations.
 */

/**
 * Checks if a given year and month combination is in the future.
 * @param {string|number} year - The publication/commencement year.
 * @param {string} monthName - The publication/commencement month (e.g. "January").
 * @returns {boolean} - True if year/month is in the future, false otherwise.
 */
exports.isFutureYearMonth = (year, monthName) => {
    const selectedYear = parseInt(year);
    if (!selectedYear || isNaN(selectedYear)) return false;

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-11

    if (selectedYear > currentYear) return true;
    if (selectedYear === currentYear && monthName) {
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const selectedMonthIndex = months.findIndex(m => m.toLowerCase() === monthName.trim().toLowerCase());
        if (selectedMonthIndex !== -1 && selectedMonthIndex > currentMonth) {
            return true;
        }
    }
    return false;
};

/**
 * Checks if a given date string or Date object is in the future.
 * @param {string|Date} dateInput - The input date.
 * @returns {boolean} - True if date is in the future, false otherwise.
 */
exports.isFutureDate = (dateInput) => {
    if (!dateInput) return false;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return false;

    const today = new Date();
    // Clear time for precise comparison
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);

    return d > today;
};

/**
 * Checks if a given date string or Date object lies within the bounds of a YYYY-YYYY academic year.
 * Spans from June 1st of the start year to June 30th of the end year.
 * @param {string|Date} dateInput - The input date.
 * @param {string} academicYearStr - The academic year string (e.g. "2025-2026").
 * @returns {boolean} - True if date is within bounds, false otherwise.
 */
exports.isDateWithinAcademicYear = (dateInput, academicYearStr) => {
    if (!dateInput || !academicYearStr) return true; // bypass if missing
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return true;

    const parts = academicYearStr.split('-');
    if (parts.length !== 2) return true;

    const startYear = parseInt(parts[0]);
    const endYear = parseInt(parts[1]);
    if (isNaN(startYear) || isNaN(endYear)) return true;

    // June 1st of startYear to June 30th of endYear
    const startDate = new Date(`${startYear}-06-01T00:00:00`);
    const endDate = new Date(`${endYear}-06-30T23:59:59`);

    return d >= startDate && d <= endDate;
};

/**
 * Validates format of a URL (must be valid HTTP or HTTPS protocol).
 * @param {string} url - The URL string.
 * @returns {boolean} - True if format is valid, false otherwise.
 */
exports.isValidURL = (url) => {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (_) {
        return false;
    }
};


