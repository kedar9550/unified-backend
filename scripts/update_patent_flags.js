const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function updatePatentFlags() {
    try {
        const dbUri = process.env.UnifiedDb;
        if (!dbUri) {
            console.error('UnifiedDb URI not found in .env');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB successfully.');

        const db = mongoose.connection.db;
        const col = db.collection('patents');

        // 1. isInstitutionRecord: "No"
        const instRecordFilter = {
            $or: [
                { isInstitutionRecord: { $exists: false } },
                { isInstitutionRecord: null },
                { isInstitutionRecord: '' }
            ]
        };
        const instRecordCount = await col.countDocuments(instRecordFilter);
        const res1 = await col.updateMany(instRecordFilter, { $set: { isInstitutionRecord: 'No' } });
        console.log(`isInstitutionRecord: Updated ${res1.modifiedCount} documents (Matched: ${instRecordCount})`);

        // 2. isUtilityType: "Yes"
        const utilityTypeFilter = {
            $or: [
                { isUtilityType: { $exists: false } },
                { isUtilityType: null },
                { isUtilityType: '' }
            ]
        };
        const utilityTypeCount = await col.countDocuments(utilityTypeFilter);
        const res2 = await col.updateMany(utilityTypeFilter, { $set: { isUtilityType: 'Yes' } });
        console.log(`isUtilityType: Updated ${res2.modifiedCount} documents (Matched: ${utilityTypeCount})`);

        // 3. isStudentsInvolved: "No"
        const studentsFilter = {
            $or: [
                { isStudentsInvolved: { $exists: false } },
                { isStudentsInvolved: null },
                { isStudentsInvolved: '' }
            ]
        };
        const studentsCount = await col.countDocuments(studentsFilter);
        const res3 = await col.updateMany(studentsFilter, { $set: { isStudentsInvolved: 'No' } });
        console.log(`isStudentsInvolved: Updated ${res3.modifiedCount} documents (Matched: ${studentsCount})`);

        // Verification
        const total = await col.countDocuments();
        const withInst = await col.countDocuments({ isInstitutionRecord: { $exists: true, $ne: null } });
        const withUtility = await col.countDocuments({ isUtilityType: { $exists: true, $ne: null } });
        const withStudents = await col.countDocuments({ isStudentsInvolved: { $exists: true, $ne: null } });

        console.log('\n--- Verification ---');
        console.log({ total, withInst, withUtility, withStudents });

        console.log('Distinct isInstitutionRecord:', await col.distinct('isInstitutionRecord'));
        console.log('Distinct isUtilityType:', await col.distinct('isUtilityType'));
        console.log('Distinct isStudentsInvolved:', await col.distinct('isStudentsInvolved'));

        const sample = await col.find({}).limit(3).project({
            title: 1,
            isInstitutionRecord: 1,
            isUtilityType: 1,
            isStudentsInvolved: 1
        }).toArray();
        console.log('\nSample documents:');
        console.log(JSON.stringify(sample, null, 2));

    } catch (err) {
        console.error('Error updating patent flags:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

updatePatentFlags();
