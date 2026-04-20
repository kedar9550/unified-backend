/**
 * Lightweight CSV parser - no external dependencies needed
 * Parses a CSV buffer/string into an array of objects using the header row as keys
 */

const parseCSV = (buffer) => {
    let text = buffer.toString('utf-8');
    
    // Strip UTF-8 BOM if present
    if (text.startsWith('\ufeff')) {
        text = text.substring(1);
    }

    // Normalize line endings
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Filter empty lines
    const nonEmpty = lines.filter(l => l.trim() !== '');

    if (nonEmpty.length < 2) {
        throw new Error('CSV must have a header row and at least one data row');
    }

    const headers = nonEmpty[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

    const rows = [];
    for (let i = 1; i < nonEmpty.length; i++) {
        let values = splitCSVLine(nonEmpty[i]);

        // If row has more columns than headers, trim trailing empty columns
        if (values.length > headers.length) {
            const extraValues = values.slice(headers.length);
            const isExtraEmpty = extraValues.every(v => v.trim() === "");
            if (isExtraEmpty) {
                values = values.slice(0, headers.length);
            }
        }

        if (values.length !== headers.length) {
            throw new Error(`Row ${i + 1} has ${values.length} columns, but header expects ${headers.length}. Please check for extra commas.`);
        }

        const row = {};
        headers.forEach((header, idx) => {
            row[header] = (values[idx] || "").trim();
        });
        rows.push(row);
    }

    return rows;
};

/**
 * Handles quoted fields with commas inside them
 */
const splitCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
};

/**
 * Validate that all required columns exist in the CSV header
 */
const validateHeaders = (rows, requiredHeaders) => {
    if (!rows || rows.length === 0) {
        throw new Error('CSV file is empty');
    }
    const csvHeaders = Object.keys(rows[0]);
    const missing = requiredHeaders.filter(h => !csvHeaders.includes(h));
    if (missing.length > 0) {
        throw new Error(`Missing required columns: ${missing.join(', ')}`);
    }
};

module.exports = { parseCSV, validateHeaders };
