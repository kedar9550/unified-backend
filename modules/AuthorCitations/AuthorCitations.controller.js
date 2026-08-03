const AuthorCitations = require("./AuthorCitations.model");
const Employee = require("../employee/employee.model");
const escapeRegex = require("../../utils/escapeRegex");
const fs = require("fs");
const readline = require("readline");

const FIELD_MAP = {
    citations: "citations",
    hindex: "hIndex"
};

const currentYear = () => new Date().getFullYear();

const toPlainMap = (mapOrObj) => {
    if (!mapOrObj) return {};
    if (mapOrObj instanceof Map) return Object.fromEntries(mapOrObj);
    return mapOrObj;
};

const getMaxYearValue = (mapOrObj) => {
    const plain = toPlainMap(mapOrObj);
    const years = Object.keys(plain).map(Number).filter((y) => !Number.isNaN(y));
    if (years.length === 0) return { year: null, value: null };
    const maxYear = Math.max(...years);
    return { year: maxYear, value: plain[String(maxYear)] };
};

const validateType = (type) => FIELD_MAP[type];

// ---------------------------------------------------------------------------
// GET /:type  -> list with latest-year value only (type = citations | hindex)
// ---------------------------------------------------------------------------
exports.getList = async (req, res, next) => {
    try {
        const { type } = req.params;
        const field = validateType(type);
        if (!field) {
            return res.status(400).json({ success: false, message: "Invalid type. Use 'citations' or 'hindex'." });
        }

        const { search } = req.query;
        let matchStage = {};
        if (search) {
            const searchRegex = new RegExp(escapeRegex(search), 'i');
            matchStage = {
                $or: [
                    { empid: searchRegex },
                    { "employee.name": searchRegex },
                    { "department.name": searchRegex }
                ]
            };
        }

        const list = await AuthorCitations.aggregate([
            {
                $lookup: {
                    from: 'employees',
                    localField: 'empid',
                    foreignField: 'institutionId',
                    as: 'employee'
                }
            },
            { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'employee.department',
                    foreignField: '_id',
                    as: 'department'
                }
            },
            { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
            { $match: matchStage },
            {
                $project: {
                    _id: 1,
                    empid: 1,
                    citations: 1,
                    hIndex: 1,
                    employeeName: '$employee.name',
                    departmentName: '$department.name',
                    designation: '$employee.designation',
                    scopusId: '$employee.scopusId'
                }
            },
            { $sort: { employeeName: 1, empid: 1 } }
        ]);

        const data = list.map((row) => {
            const { year, value } = getMaxYearValue(row[field]);
            return {
                _id: row._id,
                empid: row.empid,
                employeeName: row.employeeName || "N/A",
                designation: row.designation || "",
                departmentName: row.departmentName || "N/A",
                scopusId: row.scopusId || "",
                latestYear: year,
                latestValue: value
            };
        });

        res.status(200).json({
            success: true,
            data,
            meta: { currentYear: currentYear() }
        });
    } catch (error) {
        console.error('Get Author Citations List Error:', error);
        next(error);
    }
};

// ---------------------------------------------------------------------------
// GET /:type/:empid  -> full year-wise history for the detail page
// ---------------------------------------------------------------------------
exports.getHistory = async (req, res, next) => {
    try {
        const { type, empid } = req.params;
        const field = validateType(type);
        if (!field) {
            return res.status(400).json({ success: false, message: "Invalid type. Use 'citations' or 'hindex'." });
        }

        const employee = await Employee.findOne({ institutionId: empid });
        if (!employee) {
            return res.status(404).json({ success: false, message: `Employee with ID '${empid}' not found.` });
        }

        const doc = await AuthorCitations.findOne({ empid });
        const plainMap = doc ? toPlainMap(doc[field]) : {};

        const history = Object.entries(plainMap)
            .map(([year, value]) => ({ year: Number(year), value }))
            .sort((a, b) => a.year - b.year);

        res.status(200).json({
            success: true,
            data: {
                empid,
                employeeName: employee.name,
                designation: employee.designation || "",
                scopusId: employee.scopusId || "",
                history
            },
            meta: { currentYear: currentYear() }
        });
    } catch (error) {
        console.error('Get Author Citations History Error:', error);
        next(error);
    }
};

// ---------------------------------------------------------------------------
// GET /me/:type  -> full year-wise history for the logged-in user
// ---------------------------------------------------------------------------
exports.getMyHistory = async (req, res, next) => {
    try {
        const { type } = req.params;
        const field = validateType(type);
        if (!field) {
            return res.status(400).json({ success: false, message: "Invalid type. Use 'citations' or 'hindex'." });
        }

        const employee = await Employee.findById(req.user.userId || req.user._id);
        if (!employee) {
            return res.status(404).json({ success: false, message: "Logged in user not found as employee." });
        }

        const empid = employee.institutionId;
        const doc = await AuthorCitations.findOne({ empid });
        const plainMap = doc ? toPlainMap(doc[field]) : {};

        const history = Object.entries(plainMap)
            .map(([year, value]) => ({ year: Number(year), value }))
            .sort((a, b) => a.year - b.year);

        const { year: latestYear, value: latestValue } = getMaxYearValue(doc ? doc[field] : {});

        res.status(200).json({
            success: true,
            data: {
                empid,
                employeeName: employee.name,
                designation: employee.designation || "",
                scopusId: employee.scopusId || "",
                history,
                latestYear,
                latestValue
            },
            meta: { currentYear: currentYear() }
        });
    } catch (error) {
        console.error('Get My Author Citations History Error:', error);
        next(error);
    }
};

// ---------------------------------------------------------------------------
// POST /:type  -> upsert a single year's value { empid, year, value }
// Used both for "Add new record" and for adding/editing a year from the
// detail page. Always operates on ONE year key, never touches other years.
// ---------------------------------------------------------------------------
exports.upsertYearValue = async (req, res, next) => {
    try {
        const { type } = req.params;
        const field = validateType(type);
        if (!field) {
            return res.status(400).json({ success: false, message: "Invalid type. Use 'citations' or 'hindex'." });
        }

        const { empid, year, value } = req.body;

        if (!empid) {
            return res.status(400).json({ success: false, message: "Employee ID is required." });
        }
        if (year === undefined || year === null || year === "") {
            return res.status(400).json({ success: false, message: "Year is required." });
        }
        if (value === undefined || value === null || value === "") {
            return res.status(400).json({ success: false, message: "Value is required." });
        }

        const numericYear = Number(year);
        if (!Number.isInteger(numericYear) || numericYear < 1900) {
            return res.status(400).json({ success: false, message: "Invalid year." });
        }
        if (numericYear > currentYear()) {
            return res.status(400).json({ success: false, message: `Future year (${numericYear}) is not allowed.` });
        }

        const employee = await Employee.findOne({ institutionId: empid });
        if (!employee) {
            return res.status(404).json({ success: false, message: `Employee with ID '${empid}' not found in the database.` });
        }

        let doc = await AuthorCitations.findOne({ empid });
        if (!doc) {
            doc = new AuthorCitations({
                empid,
                facultyId: employee._id,
                citations: new Map(),
                hIndex: new Map()
            });
        } else {
            doc.facultyId = employee._id;
        }

        doc[field].set(String(numericYear), Number(value));
        await doc.save();

        res.status(200).json({
            success: true,
            message: `${type === 'citations' ? 'Citation' : 'H-Index'} value for ${numericYear} saved successfully.`,
            data: doc
        });
    } catch (error) {
        console.error('Upsert Author Citations Year Error:', error);
        next(error);
    }
};

// ---------------------------------------------------------------------------
// DELETE /:type/:empid/:year  -> remove a single year entry
// ---------------------------------------------------------------------------
exports.deleteYearValue = async (req, res, next) => {
    try {
        const { type, empid, year } = req.params;
        const field = validateType(type);
        if (!field) {
            return res.status(400).json({ success: false, message: "Invalid type. Use 'citations' or 'hindex'." });
        }

        const doc = await AuthorCitations.findOne({ empid });
        if (!doc) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        doc[field].delete(String(year));
        await doc.save();

        res.status(200).json({ success: true, message: `Year ${year} entry deleted successfully.` });
    } catch (error) {
        console.error('Delete Author Citations Year Error:', error);
        next(error);
    }
};

// ---------------------------------------------------------------------------
// POST /:type/bulk  -> bulk upload CSV (empid, year, value)
// ---------------------------------------------------------------------------
exports.bulkUpload = async (req, res, next) => {
    try {
        const { type } = req.params;
        const field = validateType(type);
        if (!field) {
            return res.status(400).json({ success: false, message: "Invalid type. Use 'citations' or 'hindex'." });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
        }

        const results = [];
        const fileStream = fs.createReadStream(req.file.path);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let isFirstRow = true;
        const thisYear = currentYear();

        for await (let line of rl) {
            if (isFirstRow && line.startsWith('\ufeff')) {
                line = line.replace(/^\ufeff/, '');
            }
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            let parts = [];
            if (trimmedLine.includes('\t')) {
                parts = trimmedLine.split('\t');
            } else if (trimmedLine.includes(';')) {
                parts = trimmedLine.split(';');
            } else {
                parts = trimmedLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            }
            parts = parts.map(p => p.replace(/^["']|["']$/g, '').trim());

            const empid = parts[0] || '';
            const year = parts[1] || '';
            const value = parts[2] || '';

            if (isFirstRow) {
                isFirstRow = false;
                const lowerEmp = empid.toLowerCase();
                if (lowerEmp.includes('emp') || lowerEmp.includes('id') || lowerEmp.includes('year')) {
                    continue;
                }
            }

            if (!empid || !year) continue;

            const numericYear = Number(year);
            if (!Number.isInteger(numericYear) || numericYear > thisYear) continue; // skip invalid/future years

            results.push({ empid, year: numericYear, value: Number(value) || 0 });
        }

        fs.unlink(req.file.path, (err) => { if (err) console.error("Error deleting temp file:", err); });

        let successCount = 0;
        let failCount = 0;

        for (const item of results) {
            try {
                const employee = await Employee.findOne({ institutionId: item.empid });
                if (!employee) { failCount++; continue; }

                let doc = await AuthorCitations.findOne({ empid: item.empid });
                if (!doc) {
                    doc = new AuthorCitations({ empid: item.empid, facultyId: employee._id, citations: new Map(), hIndex: new Map() });
                }
                doc[field].set(String(item.year), item.value);
                await doc.save();
                successCount++;
            } catch (err) {
                failCount++;
            }
        }

        res.status(200).json({
            success: true,
            message: `Bulk upload completed. Successfully processed ${successCount} records, failed/skipped ${failCount} records.`
        });
    } catch (error) {
        console.error('Bulk Upload Author Citations Error:', error);
        next(error);
    }
};
