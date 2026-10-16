const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function updateApplicantAffiliation() {
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

        const filter = {
            $or: [
                { applicantAffiliation: { $exists: false } },
                { applicantAffiliation: null },
                { applicantAffiliation: '' }
            ]
        };

        const countToUpdate = await col.countDocuments(filter);
        console.log(`Documents to update: ${countToUpdate}`);

        const result = await col.updateMany(
            filter,
            { $set: { applicantAffiliation: 'Aditya University' } }
        );

        console.log('\n--- Update Summary ---');
        console.log(`Matched Count: ${result.matchedCount}`);
        console.log(`Modified Count: ${result.modifiedCount}`);

        const totalWithAffiliation = await col.countDocuments({ applicantAffiliation: { $exists: true, $ne: null, $ne: '' } });
        const distinctAffiliations = await col.distinct('applicantAffiliation');

        console.log(`Total documents now with applicantAffiliation: ${totalWithAffiliation}`);
        console.log('Distinct applicantAffiliations:', distinctAffiliations);

        const sample = await col.find({}).limit(5).project({ title: 1, applicantName: 1, applicantAffiliation: 1 }).toArray();
        console.log('\nSample verified documents:');
        console.log(JSON.stringify(sample, null, 2));

    } catch (err) {
        console.error('Error during update:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

updateApplicantAffiliation();
