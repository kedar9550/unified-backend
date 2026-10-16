const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function renameEfilingToCbr() {
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

        // Pre-update checks
        const total = await col.countDocuments();
        const hasEfiling = await col.countDocuments({ eFilingReceipt: { $exists: true } });
        const hasCbr = await col.countDocuments({ cbr: { $exists: true } });
        const hasDbr = await col.countDocuments({ dbr: { $exists: true } });
        const alreadyHasCbrFilter = { eFilingReceipt: { $exists: true }, cbr: { $exists: true } };
        const bothCount = await col.countDocuments(alreadyHasCbrFilter);

        console.log('\n--- Pre-Update Stats ---');
        console.log(`Total patents: ${total}`);
        console.log(`Records with eFilingReceipt: ${hasEfiling}`);
        console.log(`Records with cbr (will be preserved as-is): ${hasCbr}`);
        console.log(`Records with dbr: ${hasDbr}`);
        console.log(`Records with both eFilingReceipt and cbr: ${bothCount}`);

        // Target: records with eFilingReceipt that do not already have cbr
        const targetFilter = {
            eFilingReceipt: { $exists: true },
            cbr: { $exists: false }
        };
        const targetCount = await col.countDocuments(targetFilter);
        console.log(`Records to rename (has eFilingReceipt, no cbr): ${targetCount}`);

        if (targetCount === 0) {
            console.log('No documents need renaming. Exiting.');
            return;
        }

        // Rename eFilingReceipt -> cbr
        const result = await col.updateMany(targetFilter, {
            $rename: { eFilingReceipt: 'cbr' }
        });

        console.log(`\nUpdated ${result.modifiedCount} records (renamed eFilingReceipt -> cbr).`);

        // Post-update verification
        const postEfiling = await col.countDocuments({ eFilingReceipt: { $exists: true } });
        const postCbr = await col.countDocuments({ cbr: { $exists: true } });

        console.log('\n--- Post-Update Verification ---');
        console.log(`Records still containing eFilingReceipt: ${postEfiling}`);
        console.log(`Total records now containing cbr: ${postCbr}`);

        // Sample document that was renamed
        const sampleRenamed = await col.findOne({ _id: new mongoose.Types.ObjectId('6a86e5b099cba8ffe35eede5') }, {
            projection: { title: 1, cbr: 1, eFilingReceipt: 1 }
        });
        console.log('\nSample Renamed Document:');
        console.log(JSON.stringify(sampleRenamed, null, 2));

        // Sample pre-existing cbr document
        const samplePreExisting = await col.findOne({ _id: new mongoose.Types.ObjectId('6ac88e2935549f5b7e7d126c') }, {
            projection: { title: 1, cbr: 1, eFilingReceipt: 1 }
        });
        console.log('\nSample Pre-existing CBR Document (untouched):');
        console.log(JSON.stringify(samplePreExisting, null, 2));

    } catch (err) {
        console.error('Error during rename:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

renameEfilingToCbr();
