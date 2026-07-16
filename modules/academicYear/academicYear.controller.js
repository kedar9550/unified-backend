const mongoose = require('mongoose');
const AcademicYear = require('./academicYear.model');
const escapeRegex = require('../../utils/escapeRegex');
const SemesterType = require('../semesterType/semesterType.model');
const Program = require('../academics/program.model');

/* ─────────────────────────────────────────────────────────────
   HELPER — populate programs[].programId & activeSemesterTypeId
   Returns the document after lean-friendly virtual population.
───────────────────────────────────────────────────────────── */
const populateYear = (doc) =>
    doc.populate([
        { path: 'programs.programId' },
        { path: 'programs.activeSemesterTypeId', select: 'name' }
    ]);

/* ─────────────────────────────────────────────────────────────
   CREATE ACADEMIC YEAR
   POST /api/academic-years
   Body: { startYear, endYear }            → bulk create with ALL active programs
   Body: { startYear, endYear, programId } → add single program to existing/new year
───────────────────────────────────────────────────────────── */
const createAcademicYear = async (req, res) => {
    try {
        const { startYear, endYear, programId } = req.body;

        if (!startYear || !endYear)
            return res.status(400).json({ message: 'startYear and endYear are required' });

        const currentYear = new Date().getFullYear();
        if (Number(startYear) < currentYear - 1)
            return res.status(400).json({ message: `Minimum start year is ${currentYear - 1}.` });
        if (Number(endYear) <= Number(startYear))
            return res.status(400).json({ message: 'endYear must be greater than startYear' });

        const yearStr = `${startYear}-${endYear}`;

        const oddType = await SemesterType.findOne({ name: 'ODD' });
        if (!oddType)
            return res.status(500).json({ message: 'Semester type ODD not found. Please seed semester types.' });

        // ── SINGLE PROGRAM MODE (ADD PROGRAM button) ──────────────────
        if (programId) {
            const programIdVal = new mongoose.Types.ObjectId(programId);

            // Check program exists
            const prog = await Program.findById(programIdVal);
            if (!prog)
                return res.status(404).json({ message: 'Program not found' });

            // Try to find existing year doc
            let yearDoc = await AcademicYear.findOne({ year: yearStr });

            if (yearDoc) {
                // Year exists — check if program already added
                const alreadyIn = yearDoc.programs.some(
                    p => p.programId.toString() === programIdVal.toString()
                );
                if (alreadyIn)
                    return res.status(409).json({ message: `Program already exists in academic year ${yearStr}` });

                yearDoc.programs.push({
                    programId: programIdVal,
                    isActive: false,
                    activeSemesterTypeId: oddType._id
                });
                await yearDoc.save();
            } else {
                // Year doesn't exist yet — create with just this program
                yearDoc = await AcademicYear.create({
                    year: yearStr,
                    isGlobalActive: false,
                    programs: [{
                        programId: programIdVal,
                        isActive: false,
                        activeSemesterTypeId: oddType._id
                    }]
                });
            }

            const populated = await populateYear(yearDoc);
            return res.status(201).json({
                message: `Program added to academic year ${yearStr}.`,
                academicYear: populated
            });
        }

        // ── BULK CREATE MODE (CREATE ACADEMIC YEAR button) ────────────
        const existing = await AcademicYear.findOne({ year: yearStr });
        if (existing)
            return res.status(409).json({ message: `Academic year ${yearStr} already exists` });

        const allPrograms = await Program.find({ status: true });
        if (allPrograms.length === 0)
            return res.status(400).json({ message: 'No active programs found. Please create programs first.' });

        const yearDoc = await AcademicYear.create({
            year: yearStr,
            isGlobalActive: false,
            programs: allPrograms.map(p => ({
                programId: p._id,
                isActive: false,
                activeSemesterTypeId: oddType._id
            }))
        });

        return res.status(201).json({
            message: `Academic year ${yearStr} created with ${allPrograms.length} programs (all inactive).`,
            count: allPrograms.length,
            academicYear: yearDoc
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   GET ALL ACADEMIC YEARS  (flat list for dropdowns)
   GET /api/academic-years
   Returns: { count, years: [ { _id, year, programs:[...] } ] }
   NOTE: _id here is year-level — one per "2025-2026" etc.
───────────────────────────────────────────────────────────── */
const getAcademicYears = async (req, res) => {
    try {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1; // 1-12

        let firstYearStr, secondYearStr;

        const oldYearStr = `${currentYear - 1}-${currentYear}`;
        const newYearStr = `${currentYear}-${currentYear + 1}`;

        if (currentMonth <= 6) {
            // Jan-Jun: Old one first, new one next
            firstYearStr = oldYearStr;
            secondYearStr = newYearStr;
        } else {
            // Jul-Dec: New one first, old one next
            firstYearStr = newYearStr;
            secondYearStr = oldYearStr;
        }

        // Ensure both exist in DB and fetch them
        const firstYearDoc = await AcademicYear.findOneAndUpdate(
            { year: firstYearStr },
            { $setOnInsert: { year: firstYearStr } },
            { new: true, upsert: true }
        ).populate('programs.programId').populate('programs.activeSemesterTypeId', 'name');

        const secondYearDoc = await AcademicYear.findOneAndUpdate(
            { year: secondYearStr },
            { $setOnInsert: { year: secondYearStr } },
            { new: true, upsert: true }
        ).populate('programs.programId').populate('programs.activeSemesterTypeId', 'name');

        const years = [firstYearDoc, secondYearDoc];

        res.json({ count: years.length, years });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   GET ACTIVE ACADEMIC YEAR for a given program
   GET /api/academic-years/active?programId=xxx  OR  ?program=B.Tech
───────────────────────────────────────────────────────────── */
const getActiveAcademicYear = async (req, res) => {
    try {
        const { programId, program } = req.query;
        const activeYear = await resolveActiveAcademicYear(programId || program);
        if (!activeYear)
            return res.status(404).json({ message: 'No active academic year found' });

        const populated = await populateYear(activeYear);

        // Find the specific program entry for the response
        let progEntry = null;
        if (programId || program) {
            progEntry = populated.programs.find(p => {
                const pId = p.programId?._id?.toString() || p.programId?.toString();
                const queried = programId || program;
                if (mongoose.Types.ObjectId.isValid(queried))
                    return pId === queried.toString();
                return p.programId?.name?.toLowerCase() === queried?.toLowerCase() ||
                    p.programId?.code?.toLowerCase() === queried?.toLowerCase();
            });
        }

        res.json({
            success: true,
            data: {
                _id: populated._id,
                year: populated.year,
                isActive: true,
                activeSemesterTypeId: progEntry?.activeSemesterTypeId ?? null,
                programId: progEntry?.programId ?? null
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   TOGGLE ACTIVE STATUS — for a specific program inside a year
   PUT /api/academic-years/:id/toggle-status
   Body: { isActive, programId }
───────────────────────────────────────────────────────────── */
const toggleAcademicYear = async (req, res) => {
    try {
        const { isActive, programId } = req.body;
        if (!programId)
            return res.status(400).json({ message: 'programId is required' });

        const yearDoc = await AcademicYear.findById(req.params.id);
        if (!yearDoc)
            return res.status(404).json({ message: 'Academic year not found' });

        const entry = yearDoc.programs.find(p => p.programId.toString() === programId.toString());
        if (!entry)
            return res.status(404).json({ message: 'Program not found in this academic year' });

        if (isActive) {
            // Deactivate this program in ALL other year documents
            await AcademicYear.updateMany(
                { _id: { $ne: yearDoc._id }, 'programs.programId': programId },
                { $set: { 'programs.$.isActive': false } }
            );
        }

        entry.isActive = isActive;
        await yearDoc.save();

        res.json({
            message: `${yearDoc.year} — program is now ${isActive ? 'active' : 'inactive'}`,
            year: yearDoc
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   TOGGLE ACTIVE SEMESTER TYPE — for a specific program inside a year
   PUT /api/academic-years/:id/semester-type
   Body: { semesterTypeId, programId }
───────────────────────────────────────────────────────────── */
const toggleSemesterType = async (req, res) => {
    try {
        const { semesterTypeId, programId } = req.body;
        if (!semesterTypeId)
            return res.status(400).json({ message: 'semesterTypeId is required' });
        if (!programId)
            return res.status(400).json({ message: 'programId is required' });

        const yearDoc = await AcademicYear.findById(req.params.id);
        if (!yearDoc)
            return res.status(404).json({ message: 'Academic year not found' });

        const entry = yearDoc.programs.find(p => p.programId.toString() === programId.toString());
        if (!entry)
            return res.status(404).json({ message: 'Program not found in this academic year' });

        entry.activeSemesterTypeId = semesterTypeId;
        await yearDoc.save();

        const populated = await populateYear(yearDoc);
        const updatedEntry = populated.programs.find(p =>
            p.programId?._id?.toString() === programId.toString()
        );

        res.json({
            message: `Active semester updated for ${yearDoc.year}`,
            academicYear: populated,
            program: updatedEntry
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   REMOVE A PROGRAM from an academic year
   DELETE /api/academic-years/:id/program/:programId
───────────────────────────────────────────────────────────── */
const removeProgramFromYear = async (req, res) => {
    try {
        const { id, programId } = req.params;

        const yearDoc = await AcademicYear.findById(id);
        if (!yearDoc)
            return res.status(404).json({ message: 'Academic year not found' });

        const before = yearDoc.programs.length;
        yearDoc.programs = yearDoc.programs.filter(
            p => p.programId.toString() !== programId.toString()
        );

        if (yearDoc.programs.length === before)
            return res.status(404).json({ message: 'Program not found in this academic year' });

        // If no programs left, delete the whole year doc
        if (yearDoc.programs.length === 0) {
            await yearDoc.deleteOne();
            return res.json({ message: 'Academic year deleted (no programs remaining)' });
        }

        await yearDoc.save();
        res.json({ message: 'Program removed from academic year', year: yearDoc });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   DELETE ENTIRE ACADEMIC YEAR
   DELETE /api/academic-years/:id
───────────────────────────────────────────────────────────── */
const deleteAcademicYear = async (req, res) => {
    try {
        const yearDoc = await AcademicYear.findById(req.params.id);
        if (!yearDoc)
            return res.status(404).json({ message: 'Academic year not found' });

        await yearDoc.deleteOne();
        res.json({ message: 'Academic year deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   SHARED HELPER — used by ProctorMapping and other controllers
   Finds the AcademicYear doc where a given program's isActive = true.
   Returns the full year doc (caller can read .year string from it).
───────────────────────────────────────────────────────────── */
const resolveActiveAcademicYear = async (programIdentifier) => {
    if (programIdentifier) {
        let query = {};
        if (mongoose.Types.ObjectId.isValid(programIdentifier)) {
            query = {
                programs: {
                    $elemMatch: {
                        programId: new mongoose.Types.ObjectId(programIdentifier),
                        isActive: true
                    }
                }
            };
        } else {
            // Find program by name or code first
            const prog = await Program.findOne({
                $or: [
                    { name: new RegExp('^' + escapeRegex(programIdentifier) + '$', 'i') },
                    { code: new RegExp('^' + escapeRegex(programIdentifier) + '$', 'i') }
                ]
            });
            if (prog) {
                query = {
                    programs: {
                        $elemMatch: {
                            programId: prog._id,
                            isActive: true
                        }
                    }
                };
            }
        }

        if (Object.keys(query).length > 0) {
            const yearDoc = await AcademicYear.findOne(query);
            if (yearDoc) return yearDoc;
        }
    }

    // Fallback to the globally active academic year
    return await AcademicYear.findOne({ isGlobalActive: true });
};

/* ─────────────────────────────────────────────────────────────
   ACTIVATE ACADEMIC YEAR GLOBALLY
   PUT /api/academic-years/:id/activate
───────────────────────────────────────────────────────────── */
const activateAcademicYear = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Deactivate all years globally
        await AcademicYear.updateMany(
            {},
            {
                $set: {
                    isGlobalActive: false
                }
            }
        );

        // 2. Activate the target year globally
        const updatedYear = await AcademicYear.findByIdAndUpdate(
            id,
            {
                $set: {
                    isGlobalActive: true
                }
            },
            { new: true }
        );

        if (!updatedYear) {
            return res.status(404).json({ message: 'Academic year not found' });
        }

        const populated = await populateYear(updatedYear);

        res.json({
            message: `Academic year ${updatedYear.year} is now active globally`,
            academicYear: populated
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    createAcademicYear,
    getAcademicYears,
    getActiveAcademicYear,
    toggleAcademicYear,
    toggleSemesterType,
    removeProgramFromYear,
    deleteAcademicYear,
    resolveActiveAcademicYear,   // exported — used by ProctorMapping controller
    activateAcademicYear
};

