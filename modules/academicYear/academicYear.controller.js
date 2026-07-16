const mongoose = require('mongoose');
const AcademicYear = require('./academicYear.model');

/* ─────────────────────────────────────────────────────────────
   SHARED HELPER — Resolve active academic year based on date
───────────────────────────────────────────────────────────── */
const resolveActiveAcademicYear = async () => {
    const today = new Date();
    
    // 1. Check if there's an existing active year based on date range
    let activeYear = await AcademicYear.findOne({
        startDate: { $lte: today },
        endDate: { $gte: today }
    });

    if (activeYear) {
        // Ensure this is marked active
        if (!activeYear.active) {
            activeYear.active = true;
            await activeYear.save();
        }
        // Ensure all others are false
        await AcademicYear.updateMany(
            { _id: { $ne: activeYear._id } },
            { $set: { active: false } }
        );
        return activeYear;
    }

    // 2. If no year matches today, dynamically determine the year based on June 26 rule
    const currentYear = today.getFullYear();
    const june26 = new Date(currentYear, 5, 26); // Month 5 is June
    
    let startYear, endYear;
    if (today >= june26) {
        startYear = currentYear;
        endYear = currentYear + 1;
    } else {
        startYear = currentYear - 1;
        endYear = currentYear;
    }

    const yearStr = `${startYear}-${endYear}`;
    const startDate = new Date(startYear, 5, 26);
    // End date is June 25th 23:59:59.999
    const endDate = new Date(endYear, 5, 25, 23, 59, 59, 999);

    let newActiveYear = await AcademicYear.findOne({ year: yearStr });
    
    if (!newActiveYear) {
        newActiveYear = await AcademicYear.create({
            year: yearStr,
            startDate,
            endDate,
            active: true
        });
    } else {
        newActiveYear.active = true;
        await newActiveYear.save();
    }

    // Ensure all others are false
    await AcademicYear.updateMany(
        { _id: { $ne: newActiveYear._id } },
        { $set: { active: false } }
    );

    return newActiveYear;
};

/* ─────────────────────────────────────────────────────────────
   GET ACTIVE ACADEMIC YEAR
   GET /api/academic-years/active
───────────────────────────────────────────────────────────── */
const getActiveAcademicYear = async (req, res) => {
    try {
        const activeYear = await resolveActiveAcademicYear();
        res.json({
            success: true,
            data: activeYear
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/* ─────────────────────────────────────────────────────────────
   GET ALL ACADEMIC YEARS
   GET /api/academic-years
───────────────────────────────────────────────────────────── */
const getAcademicYears = async (req, res) => {
    try {
        // Ensure the active one is computed correctly first
        await resolveActiveAcademicYear();

        const years = await AcademicYear.find().sort({ active: -1, year: -1 });
        
        res.json({ 
            count: years.length, 
            years: years, // Maintain 'years' array for frontend dropdowns
            data: years
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    getAcademicYears,
    getActiveAcademicYear,
    resolveActiveAcademicYear
};
