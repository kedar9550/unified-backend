const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function updatePatentFacultyRole() {
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

        // Pre-update inspection
        const total = await col.countDocuments();
        const existingCount = await col.countDocuments({ facultyRole: { $exists: true, $ne: null } });
        
        const missingRoleFilter = {
            $or: [
                { facultyRole: { $exists: false } },
                { facultyRole: null }
            ]
        };
        const missingTotal = await col.countDocuments(missingRoleFilter);

        const adityaFilter = {
            ...missingRoleFilter,
            patentName: /^aditya\s+university$/i
        };
        const adityaCount = await col.countDocuments(adityaFilter);

        const remainingFilter = {
            ...missingRoleFilter,
            patentName: { $not: /^aditya\s+university$/i }
        };
        const remainingCount = await col.countDocuments(remainingFilter);

        console.log('\n--- Pre-Update Stats ---');
        console.log(`Total patents: ${total}`);
        console.log(`Records already having facultyRole (will be untouched): ${existingCount}`);
        console.log(`Records missing facultyRole: ${missingTotal}`);
        console.log(`  - With patentName "Aditya university" -> to become "Inventor / Co-Inventor": ${adityaCount}`);
        console.log(`  - Remaining cases -> to become "Applicant": ${remainingCount}`);

        // Step 1: Update missing facultyRole where patentName is Aditya university
        const resAditya = await col.updateMany(
            adityaFilter,
            { $set: { facultyRole: 'Inventor / Co-Inventor' } }
        );
        console.log(`\nUpdated Aditya University records: ${resAditya.modifiedCount} modified.`);

        // Step 2: Update remaining records where facultyRole is missing
        const resRemaining = await col.updateMany(
            missingRoleFilter,
            { $set: { facultyRole: 'Applicant' } }
        );
        console.log(`Updated remaining records: ${resRemaining.modifiedCount} modified.`);

        // Verification
        const postMissing = await col.countDocuments(missingRoleFilter);
        const distinctRoles = await col.distinct('facultyRole');
        const roleDistribution = {};
        for (const role of distinctRoles) {
            roleDistribution[role] = await col.countDocuments({ facultyRole: role });
        }

        console.log('\n--- Post-Update Verification ---');
        console.log(`Records still missing facultyRole: ${postMissing}`);
        console.log('Faculty role distribution:', roleDistribution);

        const sampleInventor = await col.find({ patentName: /^aditya\s+university$/i })
            .limit(2)
            .project({ title: 1, patentName: 1, applicantName: 1, facultyRole: 1 })
            .toArray();

        const sampleApplicant = await col.find({ facultyRole: 'Applicant' })
            .limit(2)
            .project({ title: 1, patentName: 1, applicantName: 1, facultyRole: 1 })
            .toArray();

        console.log('\nSample Inventor / Co-Inventor (Aditya University):');
        console.log(JSON.stringify(sampleInventor, null, 2));

        console.log('\nSample Applicant:');
        console.log(JSON.stringify(sampleApplicant, null, 2));

    } catch (err) {
        console.error('Error during update:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

updatePatentFacultyRole();
