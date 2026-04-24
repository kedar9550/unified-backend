const AcademicYear = require('./academicYear.model');
const SemesterType = require('../semesterType/semesterType.model');

/* ===================================================
   CREATE ACADEMIC YEAR
   POST /api/academic-years
=================================================== */
const createAcademicYear = async (req, res) => {
    try {
        const { startYear, endYear } = req.body;

        if (!startYear || !endYear) {
            return res.status(400).json({ message: 'startYear and endYear are required' });
        }

        const currentYear = new Date().getFullYear();
        if (Number(startYear) < currentYear - 1) {
            return res.status(400).json({ message: `Cannot create academic year that old. Minimum start year is ${currentYear - 1}.` });
        }
        if (Number(endYear) <= Number(startYear)) {
            return res.status(400).json({ message: 'endYear must be greater than startYear' });
        }

        const yearStr = `${startYear}-${endYear}`;

        const existing = await AcademicYear.findOne({ year: yearStr });
        if (existing) {
            return res.status(409).json({ message: `Academic year ${yearStr} already exists` });
        }

        const oddType = await SemesterType.findOne({ name: 'ODD' });
        if (!oddType) {
            return res.status(500).json({ message: 'Semester type ODD not found. Please seed semester types.' });
        }

        // Auto-activate the new year by deactivating others
        await AcademicYear.updateMany({}, { isActive: false });

        const academicYear = await AcademicYear.create({ 
            year: yearStr, 
            isActive: true,
            activeSemesterTypeId: oddType._id
        });

        res.status(201).json({ 
            message: 'Academic year created and ODD semester activated.', 
            academicYear: await academicYear.populate('activeSemesterTypeId', 'name')
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   GET ALL ACADEMIC YEARS
   GET /api/academic-years
=================================================== */
const getAcademicYears = async (req, res) => {
    try {
        const years = await AcademicYear.find()
            .populate('activeSemesterTypeId', 'name')
            .sort({ year: -1 });
        res.json({ count: years.length, years });
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
        
        if (isActive) {
            await AcademicYear.updateMany({}, { isActive: false });
        }
        
        const year = await AcademicYear.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true }
        );

        if (!year) return res.status(404).json({ message: 'Academic year not found' });

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
        
        if (!year) {
            return res.status(400).json({ message: 'year is required' });
        }

        const existing = await AcademicYear.findOne({ year, _id: { $ne: req.params.id } });
        if (existing) {
            return res.status(409).json({ message: `Academic year ${year} already exists` });
        }

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
        
        if (!semesterTypeId) {
            return res.status(400).json({ message: 'semesterTypeId is required' });
        }

        const academicYear = await AcademicYear.findByIdAndUpdate(
            req.params.id,
            { activeSemesterTypeId: semesterTypeId },
            { new: true }
        ).populate('activeSemesterTypeId', 'name');

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

        // Delete the year
        await year.deleteOne();

        res.json({ message: 'Academic year deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    createAcademicYear,
    getAcademicYears,
    toggleAcademicYear,
    updateAcademicYear,
    toggleSemesterType,
    deleteAcademicYear
};
