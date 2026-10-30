const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function cleanPatentKeys() {
    try {
        const dbUri = process.env.UnifiedDb || 'mongodb://localhost:27017/unified';
        console.log('Connecting to MongoDB...');
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB successfully.');

        const db = mongoose.connection.db;
        const col = db.collection('patents');

        // Check if any old keys exist
        const oldPatentNameCount = await col.countDocuments({ patentName: { $exists: true } });
        const oldAffiliationCount = await col.countDocuments({ applicantAffiliation: { $exists: true } });

        console.log(`Documents with 'patentName': ${oldPatentNameCount}`);
        console.log(`Documents with 'applicantAffiliation': ${oldAffiliationCount}`);

        // If any document has patentName and no patentApplicantName, copy it
        const backfillName = await col.updateMany(
            { patentApplicantName: { $exists: false }, patentName: { $exists: true } },
            [{ $set: { patentApplicantName: '$patentName' } }]
        );
        console.log(`Backfilled patentApplicantName: ${backfillName.modifiedCount}`);

        const backfillAff = await col.updateMany(
            { patentApplicantAffliation: { $exists: false }, applicantAffiliation: { $exists: true } },
            [{ $set: { patentApplicantAffliation: '$applicantAffiliation' } }]
        );
        console.log(`Backfilled patentApplicantAffliation: ${backfillAff.modifiedCount}`);

        // Unset old keys completely
        const unsetResult = await col.updateMany(
            {},
            {
                $unset: {
                    patentName: '',
                    applicantAffiliation: ''
                }
            }
        );
        console.log(`Unset old keys matched: ${unsetResult.matchedCount}, modified: ${unsetResult.modifiedCount}`);

        // Verify counts
        const finalOldPatentName = await col.countDocuments({ patentName: { $exists: true } });
        const finalOldAff = await col.countDocuments({ applicantAffiliation: { $exists: true } });
        const countNewName = await col.countDocuments({ patentApplicantName: { $exists: true } });
        const countNewAff = await col.countDocuments({ patentApplicantAffliation: { $exists: true } });
        const totalDocs = await col.countDocuments({});

        console.log('\n--- Final Verification in MongoDB ---');
        console.log(`Total patent documents: ${totalDocs}`);
        console.log(`Documents with new 'patentApplicantName': ${countNewName}`);
        console.log(`Documents with new 'patentApplicantAffliation': ${countNewAff}`);
        console.log(`Documents with old 'patentName' remaining: ${finalOldPatentName}`);
        console.log(`Documents with old 'applicantAffiliation' remaining: ${finalOldAff}`);

        // Sample doc inspection
        const sample = await col.findOne({});
        console.log('\nSample document verification:');
        console.log({
            _id: sample._id,
            title: sample.title,
            patentApplicantName: sample.patentApplicantName,
            patentApplicantAffliation: sample.patentApplicantAffliation,
            patentName: sample.patentName,
            applicantAffiliation: sample.applicantAffiliation
        });

    } catch (err) {
        console.error('Error during cleanup:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

cleanPatentKeys();
