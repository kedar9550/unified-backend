const mongoose = require('mongoose');
const AcademicYear = require('./academicYear.model');
const SemesterType = require('../semesterType/semesterType.model');
const Program = require('../academics/program.model');

/* ===================================================
   CREATE ACADEMIC YEAR (program-wise)
   POST /api/academic-years
   Body: { startYear, endYear, programId? }

   - If programId provided: adds only that program to the year
   - If NO programId: creates the year with ALL active programs (all inactive)
=================================================== */
const createAcademicYear = async (req, res) => {
    try {
        const { startYear, endYear, programId } = req.body;

        if (!startYear || !endYear) {
            return res.status(400).json({ message: 'startYear and endYear are required' });
        }

        const currentYear = new Date().getFullYear();
        if (Number(startYear) < currentYear - 1) {
            return res.status(400).json({ message: `Minimum start year is ${currentYear - 1}.` });
        }
        if (Number(endYear) <= Number(startYear)) {
            return res.status(400).json({ message: 'endYear must be greater than startYear' });
        }

        // Drop legacy index if exists
        await AcademicYear.collection.dropIndex('year_1_program_1').catch(() => {});

        const yearStr = `${startYear}-${endYear}`;

        const oddType = await SemesterType.findOne({ name: 'ODD' });
        if (!oddType) {
            return res.status(500).json({ message: 'Semester type ODD not found. Please seed semester types.' });
        }

        // --- SINGLE PROGRAM MODE (used by ADD PROGRAM button) ---
        if (programId) {
            const programIdVal = new mongoose.Types.ObjectId(programId);
            const existing = await AcademicYear.findOne({ year: yearStr, programId: programIdVal });
            if (existing) {
                return res.status(409).json({ message: `Academic year ${yearStr} already exists for this program` });
            }

            const academicYear = await AcademicYear.create({
                year: yearStr,
                programId: programIdVal,
                isActive: false,           // inactive by default when manually adding
                activeSemesterTypeId: oddType._id
            });

            return res.status(201).json({
                message: `Program added to academic year ${yearStr} (inactive).`,
                academicYear: await academicYear.populate([
                    { path: 'activeSemesterTypeId', select: 'name' },
                    { path: 'programId' }
                ])
            });
        }

        // --- BULK CREATE MODE (used by CREATE ACADEMIC YEAR button) ---
        // Check if year already exists (any program)
        const anyExisting = await AcademicYear.findOne({ year: yearStr });
        if (anyExisting) {
            return res.status(409).json({ message: `Academic year ${yearStr} already exists` });
        }

        const allPrograms = await Program.find({ status: true });
        if (allPrograms.length === 0) {
            return res.status(400).json({ message: 'No active programs found. Please create programs first.' });
        }

        const entries = allPrograms.map(p => ({
            year: yearStr,
            programId: p._id,
            isActive: false,                // all inactive by default
            activeSemesterTypeId: oddType._id
        }));

        await AcademicYear.insertMany(entries);

        return res.status(201).json({
            message: `Academic year ${yearStr} created with ${allPrograms.length} programs (all inactive).`,
            count: allPrograms.length
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
        const { programId } = req.query;
        const activeYear = await resolveActiveAcademicYear(programId);
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
            // Deactivate this program in ALL other academic years (any year string)
            // so only one year per program is ever active at a time
            await AcademicYear.updateMany(
                { programId: year.programId, _id: { $ne: year._id } },
                { isActive: false }
            );
        }

        year.isActive = isActive;
        await year.save();

        res.json({
            message: `${year.year} — program is now ${isActive ? 'active' : 'inactive'}`,
            year
        });
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
const resolveActiveAcademicYear = async (programInput) => {
    if (!programInput) return null;

    let programId = programInput;

    // If input is a program name (not an ObjectId), look up the programId
    if (!mongoose.Types.ObjectId.isValid(programInput)) {
        const prog = await Program.findOne({ name: new RegExp(`^${programInput}$`, "i") });
        if (!prog) return null;
        programId = prog._id;
    }

    return await AcademicYear.findOne({ programId, isActive: true });
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
