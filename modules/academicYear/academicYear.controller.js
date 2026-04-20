const AcademicYear = require('./academicYear.model');
const Semester = require('../semester/semester.model');

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

        // Auto-activate the new year by deactivating others
        await AcademicYear.updateMany({}, { isActive: false });
        await Semester.updateMany({}, { isActive: false }); // Reset semesters too

        const academicYear = await AcademicYear.create({ year: yearStr, isActive: true });

        // Auto-create ODD semester and activate it
        const semester = await Semester.create({
            academicYear: academicYear._id,
            type: 'ODD',
            isActive: true
        });

        res.status(201).json({ message: 'Academic year and ODD semester created and activated.', academicYear, semester });

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
        const years = await AcademicYear.find().sort({ year: -1 });
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
   CREATE SEMESTER UNDER ACADEMIC YEAR
   POST /api/academic-years/:id/semesters
=================================================== */
const createSemester = async (req, res) => {
    try {
        const { type } = req.body;

        if (!type) {
            return res.status(400).json({ message: 'type is required (ODD | EVEN | SUMMER)' });
        }

        const academicYear = await AcademicYear.findById(req.params.id);
        if (!academicYear) return res.status(404).json({ message: 'Academic year not found' });

        const existing = await Semester.findOne({
            academicYear: req.params.id,
            type: type.toUpperCase()
        });

        if (existing) {
            return res.status(409).json({
                message: `${type.toUpperCase()} semester already exists for ${academicYear.year}`
            });
        }
        
        const isActive = academicYear.isActive;
        if (isActive) {
            await Semester.updateMany({}, { isActive: false });
        }

        const semester = await Semester.create({
            academicYear: req.params.id,
            type: type.toUpperCase(),
            isActive: isActive
        });

        res.status(201).json({ message: 'Semester created', semester });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   GET SEMESTERS BY ACADEMIC YEAR
   GET /api/academic-years/:id/semesters
=================================================== */
const getSemesters = async (req, res) => {
    try {
        const semesters = await Semester.find({ academicYear: req.params.id })
            .populate('academicYear', 'year');

        res.json({ count: semesters.length, semesters });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ===================================================
   TOGGLE ACTIVE SEMESTER
   PUT /api/academic-years/:id/semesters/:semesterId/toggle-status
=================================================== */
const toggleSemester = async (req, res) => {
    try {
        const { isActive } = req.body;
        
        if (isActive) {
            const parentYear = await AcademicYear.findById(req.params.id);
            if (!parentYear) return res.status(404).json({ message: 'Academic year not found' });
            if (!parentYear.isActive) {
                return res.status(400).json({ message: 'Cannot activate semester: parent Academic Year is not active.' });
            }
            await Semester.updateMany({}, { isActive: false });
        }
        
        const semester = await Semester.findByIdAndUpdate(
            req.params.semesterId,
            { isActive },
            { new: true }
        );

        if (!semester) return res.status(404).json({ message: 'Semester not found' });

        res.json({ message: `${semester.type} semester is now ${isActive ? 'active' : 'inactive'}`, semester });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    createAcademicYear,
    getAcademicYears,
    toggleAcademicYear,
    updateAcademicYear,
    createSemester,
    getSemesters,
    toggleSemester
};
