const mongoose = require('mongoose');
const AcademicYear = require('./academicYear.model');
const SemesterType = require('../semesterType/semesterType.model');

/* ===================================================
   CREATE ACADEMIC YEAR (program-wise)
   POST /api/academic-years
   Body: { startYear, endYear, program? }
   
   program is optional:
   - If provided: creates year for that specific program (e.g. "B.Tech")
   - If not provided: creates global year (program: null) — fallback for all programs
=================================================== */
const createAcademicYear = async (req, res) => {
    try {
        const { startYear, endYear, programId } = req.body;

        if (!startYear || !endYear) {
            return res.status(400).json({ message: 'startYear and endYear are required' });
        }
        if (!programId) {
            return res.status(400).json({ message: 'Program is required to create an academic year' });
        }

        const currentYear = new Date().getFullYear();
        if (Number(startYear) < currentYear - 1) {
            return res.status(400).json({ message: `Cannot create academic year that old. Minimum start year is ${currentYear - 1}.` });
        }
        if (Number(endYear) <= Number(startYear)) {
            return res.status(400).json({ message: 'endYear must be greater than startYear' });
        }

        // Try to drop the legacy year_1_program_1 index if it exists (ignoring errors if it doesn't)
        await AcademicYear.collection.dropIndex('year_1_program_1').catch(() => {});

        const yearStr = `${startYear}-${endYear}`;
        const programIdVal = new mongoose.Types.ObjectId(programId);

        const existing = await AcademicYear.findOne({ year: yearStr, programId: programIdVal });
        if (existing) {
            return res.status(409).json({ message: `Academic year ${yearStr} already exists for this program` });
        }

        const oddType = await SemesterType.findOne({ name: 'ODD' });
        if (!oddType) {
            return res.status(500).json({ message: 'Semester type ODD not found. Please seed semester types.' });
        }

        // Deactivate only same-program years (don't touch other programs)
        await AcademicYear.updateMany(
            { programId: programIdVal },
            { isActive: false }
        );

        const academicYear = await AcademicYear.create({
            year: yearStr,
            programId: programIdVal,
            isActive: true,
            activeSemesterTypeId: oddType._id
        });

        res.status(201).json({
            message: `Academic year created for program. ODD semester activated.`,
            academicYear: await academicYear.populate([
                { path: 'activeSemesterTypeId', select: 'name' },
                { path: 'programId' }
            ])
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   GET ALL ACADEMIC YEARS
   GET /api/academic-years?program=B.Tech
=================================================== */
const getAcademicYears = async (req, res) => {
    try {
        const { programId } = req.query;
        const query = {};
        if (programId) query.programId = programId;

        const years = await AcademicYear.find(query)
            .populate('activeSemesterTypeId', 'name')
            .populate('programId')
            .sort({ year: -1 });
        res.json({ count: years.length, years });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   GET ACTIVE ACADEMIC YEAR for a given program
   GET /api/academic-years/active?program=B.Tech
   
   Lookup priority:
   1. Active year for that specific program
   2. Active global year (program: null) as fallback
=================================================== */
const getActiveAcademicYear = async (req, res) => {
    try {
        const { programId, program } = req.query;
        const activeYear = await resolveActiveAcademicYear(programId || program);
        if (!activeYear) {
            return res.status(404).json({ message: `No active academic year found` });
        }
        const populated = await activeYear.populate([
            { path: 'activeSemesterTypeId', select: 'name' },
            { path: 'programId' }
        ]);
        res.json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   TOGGLE ACTIVE YEAR
   PUT /api/academic-years/:id/toggle-status
=================================================== */
const toggleAcademicYear = async (req, res) => {
    try {
        const { isActive } = req.body;
        const year = await AcademicYear.findById(req.params.id);
        if (!year) return res.status(404).json({ message: 'Academic year not found' });

        if (isActive) {
            // Deactivate only same-program years
            const filterProgId = year.programId ? new mongoose.Types.ObjectId(year.programId) : null;
            await AcademicYear.updateMany({ programId: filterProgId }, { isActive: false });
        }

        year.isActive = isActive;
        await year.save();

        res.json({ message: `${year.year} is now ${isActive ? 'active' : 'inactive'}`, year });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   UPDATE ACADEMIC YEAR (Rename)
   PUT /api/academic-years/:id
=================================================== */
const updateAcademicYear = async (req, res) => {
    try {
        const { year } = req.body;
        if (!year) return res.status(400).json({ message: 'year is required' });

        const existing = await AcademicYear.findOne({ year, _id: { $ne: req.params.id } });
        if (existing) return res.status(409).json({ message: `Academic year ${year} already exists` });

        const updatedYear = await AcademicYear.findByIdAndUpdate(
            req.params.id,
            { year },
            { new: true }
        );
        if (!updatedYear) return res.status(404).json({ message: 'Academic year not found' });

        res.json({ message: 'Academic year updated', year: updatedYear });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   TOGGLE ACTIVE SEMESTER TYPE FOR A YEAR
   PUT /api/academic-years/:id/semester-type
=================================================== */
const toggleSemesterType = async (req, res) => {
    try {
        const { semesterTypeId } = req.body;
        if (!semesterTypeId) return res.status(400).json({ message: 'semesterTypeId is required' });

        const academicYear = await AcademicYear.findByIdAndUpdate(
            req.params.id,
            { activeSemesterTypeId: semesterTypeId },
            { new: true }
        ).populate([
            { path: 'activeSemesterTypeId', select: 'name' },
            { path: 'programId' }
        ]);

        if (!academicYear) return res.status(404).json({ message: 'Academic year not found' });

        res.json({
            message: `Active semester for ${academicYear.year} changed to ${academicYear.activeSemesterTypeId.name}`,
            academicYear
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   DELETE ACADEMIC YEAR
   DELETE /api/academic-years/:id
=================================================== */
const deleteAcademicYear = async (req, res) => {
    try {
        const year = await AcademicYear.findById(req.params.id);
        if (!year) return res.status(404).json({ message: 'Academic year not found' });

        await year.deleteOne();
        res.json({ message: 'Academic year deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   SHARED HELPER — used by other controllers
   Resolves active academic year for a given program.
   Falls back to global (program: null) if no program-specific year found.
=================================================== */
const resolveActiveAcademicYear = async (programIdentifier) => {
    if (!programIdentifier) return null;

    let query = {};
    if (mongoose.Types.ObjectId.isValid(programIdentifier)) {
        query.programId = programIdentifier;
    } else {
        // Find program by name
        const Program = mongoose.model('Program');
        const prog = await Program.findOne({ name: new RegExp(`^${programIdentifier}$`, "i") });
        if (!prog) return null;
        query.programId = prog._id;
    }

    return await AcademicYear.findOne({ ...query, isActive: true });
};

module.exports = {
    createAcademicYear,
    getAcademicYears,
    getActiveAcademicYear,
    toggleAcademicYear,
    updateAcademicYear,
    toggleSemesterType,
    deleteAcademicYear,
    resolveActiveAcademicYear  // exported for use in other controllers
};
