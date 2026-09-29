const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Journal = require('./modules/Journal/Journal.model');
const Employee = require('./modules/Employee/employee.model');
const AcademicYear = require('./modules/AcademicYear/academicYear.model');

mongoose.connect(process.env.UnifiedDb).then(async () => {
    console.log("Connected to DB");
    try {
        const emp = await Employee.findOne({ institutionId: '6682' });
        if (!emp) {
            console.log("Employee with institutionId 6682 not found");
            process.exit(1);
        }

        const acYear = await AcademicYear.findOne({ active: true });
        if (!acYear) {
            console.log("Active Academic Year not found");
            process.exit(1);
        }

        const newJournal = new Journal({
            facultyId: emp._id,
            academicYear: acYear._id,
            doi: '10.1234/test.doi.' + Date.now(),
            isScopus: 'Yes',
            totalAuthors: 3,
            userAuthorPosition: 1,
            journalQuartile: 'Q1',
            paperTitle: 'Sample Journal Paper ' + Date.now(),
            journalName: 'Test Journal of Science',
            publishedMonth: '09',
            publishedYear: '2026',
            applyingSeedGrant: 'No',
            applyIncentive: 'No',
            publishedPaper: 'dummy-paper.pdf',
            referencePages: 'dummy-ref.pdf',
            status: 'Pending'
        });

        await newJournal.save();
        console.log("Successfully created Journal entry for emp 6682");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
});
