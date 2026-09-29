require('dotenv').config();
const mongoose = require('mongoose');

const dbUri = process.env.UnifiedDb;

mongoose.connect(dbUri).then(async () => {
    try {
        const db = mongoose.connection.db;

        // Find the employee 3704
        const employee = await db.collection('employees').findOne({ institutionId: '3704' });
        
        if (!employee) {
            console.log("EMPLOYEE NOT FOUND. TRYING TO INSERT ANYWAY OR FINDING ANY.");
            process.exit(1);
        }

        console.log("FOUND EMPLOYEE:", employee.institutionId, employee._id);

        // Find an active academic year
        let academicYear = await db.collection('academicyears').findOne({ isCurrent: true });
        if (!academicYear) {
            academicYear = await db.collection('academicyears').findOne({});
        }

        // Insert Dummy Journal Entry
        const journalDoc = {
            facultyId: employee._id,
            academicYear: academicYear ? academicYear._id : null,
            isInstitutionRecord: 'No',
            entryType: 'Self',
            college: employee.institution || 'Engineering',
            panNumber: employee.panNumber || 'ABCDE1234F',
            doi: '10.dummy/' + Date.now(),
            isNoDoi: 'No',
            isScopus: 'Yes',
            isWos: 'No',
            totalAuthors: 3,
            userAuthorPosition: 1,
            journalQuartile: 'Q1',
            journalType: 'SCI',
            journalCategory: 'IEEE',
            paperTitle: 'Dummy Journal Paper by 3704 - ' + Date.now(),
            coAuthors: [],
            status: 'Pending',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('journals').insertOne(journalDoc);
        console.log("INSERTED DUMMY JOURNAL. ID:", result.insertedId);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
});
