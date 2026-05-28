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
