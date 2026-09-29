const axios = require('axios');

/**
 * Get configured headers for ECAP API calls
 */
const getEcapHeaders = () => {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };

    if (process.env.ECAP_API_KEY) {
        headers['X-API-Key'] = process.env.ECAP_API_KEY;
        headers['x-api-key'] = process.env.ECAP_API_KEY;
        headers['apiKey'] = process.env.ECAP_API_KEY;
    }
    if (process.env.ECAP_API_SECRET) {
        headers['x-api-secret'] = process.env.ECAP_API_SECRET;
        headers['apiSecret'] = process.env.ECAP_API_SECRET;
    }
    if (process.env.ECAP_AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.ECAP_AUTH_TOKEN}`;
    }

    return headers;
};

/**
 * Fetch Staff/Employee Details from ECAP API
 * @param {string|number} employeeId
 */
const fetchStaffFromEcap = async (employeeId) => {
    if (!employeeId) return null;
    const cleanId = String(employeeId).trim();
    const rawUrl = process.env.STAFF_DATA_API_URL || process.env.ECAP_STAFF_API_URL;

    if (!rawUrl) {
        console.error('[ECAP Service] STAFF_DATA_API_URL is not configured in .env');
        throw new Error('ECAP Staff API URL is not configured in environment');
    }

    const baseUrl = rawUrl.replace(/\/+$/, "");

    try {
        const response = await axios.get(`${baseUrl}/${cleanId}`, {
            headers: getEcapHeaders(),
            timeout: 10000
        });

        if (Array.isArray(response.data) && response.data.length > 0) {
            const item = response.data[0];
            if (item && (item.employeename || item.EmployeeName || item.empname)) {
                return item;
            }
        } else if (response.data && typeof response.data === 'object' && !response.data.error) {
            return response.data;
        }
        return null;
    } catch (error) {
        console.error(`[ECAP Service] Error fetching staff data for ${cleanId}:`, error.message);
        throw error;
    }
};

/**
 * Fetch Student Details from ECAP API
 * @param {string} rollNo
 */
const fetchStudentFromEcap = async (rollNo) => {
    if (!rollNo) return null;
    const cleanRoll = String(rollNo).trim().toUpperCase();
    const rawUrl = process.env.STUDENT_DATA_API_URL || process.env.ECAP_STUDENT_API_URL;

    if (!rawUrl) {
        console.error('[ECAP Service] STUDENT_DATA_API_URL is not configured in .env');
        throw new Error('ECAP Student API URL is not configured in environment');
    }

    const baseUrl = rawUrl.replace(/\/+$/, "");

    try {
        const response = await axios.get(`${baseUrl}/${cleanRoll}`, {
            headers: getEcapHeaders(),
            timeout: 10000
        });

        if (Array.isArray(response.data) && response.data.length > 0) {
            const item = response.data[0];
            if (item && (item.rollno || item.studentname || item.RollNo)) {
                return item;
            }
        } else if (response.data && typeof response.data === 'object' && !response.data.error) {
            return response.data;
        }
        return null;
    } catch (error) {
        console.error(`[ECAP Service] Error fetching student data for ${cleanRoll}:`, error.message);
        throw error;
    }
};

module.exports = {
    fetchStaffFromEcap,
    fetchStudentFromEcap,
    getEcapHeaders
};
