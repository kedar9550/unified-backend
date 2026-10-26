const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function renameFilingNoToApplicationNo() {
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

        // Drop the legacy non-sparse unique index on filingNo if it exists
        const indexes = await col.indexes();
        const hasFilingIndex = indexes.some(idx => idx.name === 'filingNo_1');
        if (hasFilingIndex) {
            console.log('Dropping legacy filingNo_1 index...');
            await col.dropIndex('filingNo_1');
            console.log('Dropped filingNo_1 index successfully.');
        }

        const filter = {
            $or: [
                { applicationNo: { $exists: false } },
                { applicationNo: null },
                { applicationNo: '' }
            ],
            filingNo: { $exists: true, $ne: null }
        };

        const matchingCount = await col.countDocuments(filter);
        console.log(`Found ${matchingCount} documents with filingNo and no applicationNo.`);

        const result = await col.updateMany(
            filter,
            { $rename: { filingNo: 'applicationNo' } }
        );

        console.log('\n--- Update Summary ---');
        console.log(`Matched Count: ${result.matchedCount}`);
        console.log(`Modified Count: ${result.modifiedCount}`);

        // Ensure unique sparse index on applicationNo
        console.log('Creating unique sparse index on applicationNo...');
        await col.createIndex({ applicationNo: 1 }, { unique: true, sparse: true });
        console.log('Created applicationNo_1 index.');

        // Verify remaining documents
        const remainingWithFilingNo = await col.countDocuments({ filingNo: { $exists: true } });
        const totalWithApplicationNo = await col.countDocuments({ applicationNo: { $exists: true, $ne: null } });
        const totalWithoutApplicationNo = await col.countDocuments({
            $or: [
                { applicationNo: { $exists: false } },
                { applicationNo: null },
                { applicationNo: '' }
            ]
        });

        console.log(`Total documents now with applicationNo: ${totalWithApplicationNo}`);
        console.log(`Remaining with filingNo: ${remainingWithFilingNo}`);
        console.log(`Remaining without applicationNo: ${totalWithoutApplicationNo}`);

        // Sample documents
        const sample = await col.find({}).limit(5).project({ title: 1, applicationNo: 1, filingNo: 1 }).toArray();
        console.log('\nSample verified documents:');
        console.log(JSON.stringify(sample, null, 2));

    } catch (err) {
        console.error('Error during rename operation:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

renameFilingNoToApplicationNo();
