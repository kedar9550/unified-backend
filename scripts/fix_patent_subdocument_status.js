const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixSubdocumentStatus() {
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

        // 1. Where grantedstatus is 'no', granted.status should not be 'Approved', it should be blank ('')
        const grantedNoFilter = {
            'granted.grantedstatus': 'no',
            'granted.status': { $in: ['Approved', 'approved'] }
        };
        const grantedCount = await col.countDocuments(grantedNoFilter);
        console.log(`\nRecords where grantedstatus is "no" and granted.status is "Approved": ${grantedCount}`);

        const res1 = await col.updateMany(grantedNoFilter, {
            $set: { 'granted.status': '' }
        });
        console.log(`Updated ${res1.modifiedCount} records -> set granted.status to ""`);

        // 2. Where publishedstatus is 'no', published.status should not be 'Approved', it should be blank ('')
        const publishedNoFilter = {
            'published.publishedstatus': 'no',
            'published.status': { $in: ['Approved', 'approved'] }
        };
        const publishedCount = await col.countDocuments(publishedNoFilter);
        console.log(`\nRecords where publishedstatus is "no" and published.status is "Approved": ${publishedCount}`);

        const res2 = await col.updateMany(publishedNoFilter, {
            $set: { 'published.status': '' }
        });
        console.log(`Updated ${res2.modifiedCount} records -> set published.status to ""`);

        // Verification
        const remainingGrantedWrong = await col.countDocuments(grantedNoFilter);
        const remainingPublishedWrong = await col.countDocuments(publishedNoFilter);

        console.log('\n--- Post-Update Verification ---');
        console.log(`Remaining granted.grantedstatus == "no" with status "Approved": ${remainingGrantedWrong}`);
        console.log(`Remaining published.publishedstatus == "no" with status "Approved": ${remainingPublishedWrong}`);

        console.log('\nDistinct granted.status where grantedstatus == "no":', await col.distinct('granted.status', { 'granted.grantedstatus': 'no' }));
        console.log('Distinct published.status where publishedstatus == "no":', await col.distinct('published.status', { 'published.publishedstatus': 'no' }));

        console.log('\nDistinct granted.status where grantedstatus == "yes":', await col.distinct('granted.status', { 'granted.grantedstatus': 'yes' }));
        console.log('Distinct published.status where publishedstatus == "yes":', await col.distinct('published.status', { 'published.publishedstatus': 'yes' }));

        // Sample documents
        const samplePub = await col.findOne({ patentStatus: 'Published' }, {
            projection: { title: 1, patentStatus: 1, 'published.publishedstatus': 1, 'published.status': 1, 'granted.grantedstatus': 1, 'granted.status': 1 }
        });
        console.log('\nSample Published Record:');
        console.log(JSON.stringify(samplePub, null, 2));

        const sampleGra = await col.findOne({ patentStatus: 'Granted' }, {
            projection: { title: 1, patentStatus: 1, 'published.publishedstatus': 1, 'published.status': 1, 'granted.grantedstatus': 1, 'granted.status': 1 }
        });
        console.log('\nSample Granted Record:');
        console.log(JSON.stringify(sampleGra, null, 2));

    } catch (err) {
        console.error('Error fixing subdocument status:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

fixSubdocumentStatus();
