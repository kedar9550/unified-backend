const AuthorCitations = require("./AuthorCitations.model");
const Employee = require("../employee/employee.model");
const AcademicYear = require("../academicYear/academicYear.model");
const escapeRegex = require("../../utils/escapeRegex");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Get all author citations with lookup
exports.getAuthorCitations = async (req, res, next) => {
    try {
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
            {
                $unwind: {
                    path: '$employee',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'employee.department',
                    foreignField: '_id',
                    as: 'department'
                }
            },
            {
                $unwind: {
                    path: '$department',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $match: matchStage
            },
            {
                $project: {
                    _id: 1,
                    empid: 1,
                    scopusId: 1,
                    citations: 1,
                    hIndex: 1,
                    employeeName: '$employee.name',
                    departmentName: '$department.name',
                    designation: '$employee.designation'
                }
            },
            {
                $sort: { employeeName: 1, empid: 1 }
            }
        ]);

        // Get the active academic year to send in metadata
        const activeYearDoc = await AcademicYear.findOne({ isGlobalActive: true });
        const activeYear = activeYearDoc ? activeYearDoc.year : "2025-2026";
        const startYear = parseInt(activeYear.split('-')[0], 10) || 2025;

        res.status(200).json({
            success: true,
            data: list,
            meta: {
                activeAcademicYear: activeYear,
                citationYear: startYear,
                hIndexYears: [startYear - 1, startYear]
            }
        });
    } catch (error) {
        console.error('Get Author Citations Error:', error);
        next(error);
    }
};

// Add or Update Author Citations
exports.addOrUpdateAuthorCitations = async (req, res, next) => {
    try {
        const { empid, scopusId, citations, hIndexPrev, hIndexCurr } = req.body;

        if (!empid) {
            return res.status(400).json({ success: false, message: "Employee ID (empid) is required." });
        }

        // Validate employee exists locally
        const employee = await Employee.findOne({ institutionId: empid });
        if (!employee) {
            return res.status(404).json({ success: false, message: `Employee with ID '${empid}' not found in the database.` });
        }

        // Get active academic year
        const activeYearDoc = await AcademicYear.findOne({ isGlobalActive: true });
        if (!activeYearDoc) {
            return res.status(400).json({ success: false, message: "No active academic year is configured." });
        }

        const [startYearStr] = activeYearDoc.year.split('-');
        const startYear = parseInt(startYearStr, 10);
        const prevYear = startYear - 1;

        let doc = await AuthorCitations.findOne({ empid });
        if (!doc) {
            doc = new AuthorCitations({
                empid,
                facultyId: employee._id,
                scopusId: scopusId || employee.scopusId || "",
                citations: new Map(),
                hIndex: new Map()
            });
        } else {
            doc.facultyId = employee._id;
            if (scopusId !== undefined) {
                doc.scopusId = scopusId;
            }
        }

        // Update the maps (appends or overrides for the specific year key)
        if (citations !== undefined && citations !== null && citations !== "") {
            doc.citations.set(String(startYear), Number(citations));
        }
        if (hIndexPrev !== undefined && hIndexPrev !== null && hIndexPrev !== "") {
            doc.hIndex.set(String(prevYear), Number(hIndexPrev));
        }
        if (hIndexCurr !== undefined && hIndexCurr !== null && hIndexCurr !== "") {
            doc.hIndex.set(String(startYear), Number(hIndexCurr));
        }

        await doc.save();

        // Keep Employee's scopusId in sync
        if (scopusId) {
            await Employee.updateOne({ institutionId: empid }, { $set: { scopusId } });
        }

        res.status(200).json({
            success: true,
            message: "Author citations updated successfully.",
            data: doc
        });
    } catch (error) {
        console.error('Add/Update Author Citations Error:', error);
        next(error);
    }
};

// Delete Author Citations Record
exports.deleteAuthorCitations = async (req, res, next) => {
    try {
        const { id } = req.params;
        const record = await AuthorCitations.findByIdAndDelete(id);

        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        res.status(200).json({
            success: true,
            message: "Author citations record deleted successfully."
        });
    } catch (error) {
        console.error('Delete Author Citations Error:', error);
        next(error);
    }
};

// Bulk Upload Author Citations from CSV
exports.bulkUploadAuthorCitations = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
        }

        // Get the active academic year
        const activeYearDoc = await AcademicYear.findOne({ isGlobalActive: true });
        const activeYear = activeYearDoc ? activeYearDoc.year : "2025-2026";
        const startYear = parseInt(activeYear.split('-')[0], 10) || 2025;
        
        const citationYear = String(startYear);
        const prevHIndexYear = String(startYear - 1);
        const currHIndexYear = String(startYear);

        const results = [];
        const fileStream = fs.createReadStream(req.file.path);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let isFirstRow = true;

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
            const scopusId = parts[1] || '';
            const citations = parts[2] || '0';
            const hIndexPrev = parts[3] || '0';
            const hIndexCurr = parts[4] || '0';

            // Detect and skip headers row
            if (isFirstRow) {
                isFirstRow = false;
                const lowerEmp = empid.toLowerCase();
                if (lowerEmp.includes('emp') || lowerEmp.includes('id') || lowerEmp.includes('name')) {
                    continue;
                }
            }

            if (!empid) continue;

            results.push({
                empid,
                scopusId,
                citations: Number(citations) || 0,
                hIndexPrev: Number(hIndexPrev) || 0,
                hIndexCurr: Number(hIndexCurr) || 0
            });
        }

        // Clean up uploaded file
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("Error deleting temp file:", err);
        });

        let successCount = 0;
        let failCount = 0;

        for (const item of results) {
            try {
                let doc = await AuthorCitations.findOne({ empid: item.empid });
                if (!doc) {
                    doc = new AuthorCitations({
                        empid: item.empid,
                        citations: {},
                        hIndex: {}
                    });
                }

                if (item.scopusId) {
                    doc.scopusId = item.scopusId;
                }
                doc.citations.set(citationYear, item.citations);
                doc.hIndex.set(prevHIndexYear, item.hIndexPrev);
                doc.hIndex.set(currHIndexYear, item.hIndexCurr);

                await doc.save();

                // Sync to Employee profile too
                if (item.scopusId) {
                    await Employee.updateOne({ institutionId: item.empid }, { $set: { scopusId: item.scopusId } });
                }

                successCount++;
            } catch (err) {
                failCount++;
            }
        }

        res.status(200).json({
            success: true,
            message: `Bulk upload completed. Successfully processed ${successCount} records, failed ${failCount} records.`
        });
    } catch (error) {
        console.error('Bulk Upload Author Citations Error:', error);
        next(error);
    }
};
