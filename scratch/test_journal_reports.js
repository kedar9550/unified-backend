const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Journal = require('../modules/Journal/Journal.model');
const Employee = require('../modules/employee/employee.model');
const AcademicYear = require('../modules/AcademicYear/AcademicYear.model');
require('../modules/academics/department.model');

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log("Connected to database successfully.");

        const allJournals = await Journal.find({}).lean();
        console.log(`Total journals in db: ${allJournals.length}`);
        
        const statusCounts = {};
        allJournals.forEach(j => {
            statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
        });
        console.log("Status breakdown:", statusCounts);

        const Textbook = require('../modules/Textbook/Textbook.model');
        const BookChapter = require('../modules/BookChapter/BookChapter.model');
        const textbookCount = await Textbook.countDocuments({});
        const chapterCount = await BookChapter.countDocuments({});
        console.log(`Total textbooks in db: ${textbookCount}`);
        console.log(`Total book chapters in db: ${chapterCount}`);

        const years = await AcademicYear.find({}).lean();
        console.log("Academic Years in DB:", JSON.stringify(years, null, 2));

        const sampleEmployees = await Employee.find({}).limit(5).select('_id name department coreDepartment').lean();
        console.log("Sample Employees in DB:", JSON.stringify(sampleEmployees, null, 2));

        const query = { status: 'Approved' };
        const journals = await Journal.find(query)
            .populate({
                path: 'facultyId',
                select: 'name institutionId department coreDepartment panNumber',
                populate: { path: 'coreDepartment', select: 'name' }
            })
            .populate('academicYear', 'year')
            .lean();

        console.log(`Found ${journals.length} approved journals.`);
        if (journals.length > 0) {
            const sample = journals.slice(0, 3).map(item => {
                let category = 'SCOPUS';
                const quartile = (item.journalQuartile || '').toUpperCase().trim();
                
                if (quartile === 'Q1') {
                    category = 'Q1';
                } else if (quartile === 'Q2') {
                    category = 'Q2';
                }

                return {
                    dept: item.facultyId?.coreDepartment?.name || item.facultyId?.department?.name || 'N/A',
                    facultyName: item.facultyId?.name || 'N/A',
                    empId: item.facultyId?.institutionId || 'N/A',
                    journalName: item.journalName || 'N/A',
                    paperTitle: item.paperTitle || 'N/A',
                    year: item.academicYear?.year || item.publishedYear || 'N/A',
                    amount: item.approvedAmount || 0,
                    panNo: item.panNumber || item.facultyId?.panNumber || 'N/A',
                    category: category
                };
            });
            console.log("Sample mapped data:", JSON.stringify(sample, null, 2));
        }
    } catch (err) {
        console.error("Error in test script:", err);
    }
    process.exit(0);
};

test();
