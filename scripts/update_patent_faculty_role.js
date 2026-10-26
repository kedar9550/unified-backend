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

        // Regex matching Aditya university, AUS, AEC, Aditya College of Pharmacy (case-insensitive, handling multiple spaces)
        const institutionRegex = /^(aditya\s+university|aus|aec|aditya\s+college\s+of\s+pharmacy)$/i;

        const missingRoleFilter = {
            $or: [
                { facultyRole: { $exists: false } },
                { facultyRole: null },
                { facultyRole: '' }
            ]
        };

        const totalRecords = await col.countDocuments();
        const existingWithRole = await col.countDocuments({
            facultyRole: { $exists: true, $ne: null, $ne: '' }
        });
        const missingCount = await col.countDocuments(missingRoleFilter);

        console.log('\n--- Pre-Update Status ---');
        console.log(`Total documents: ${totalRecords}`);
        console.log(`Records already having facultyRole (will NOT be touched): ${existingWithRole}`);
        console.log(`Records missing facultyRole to be updated: ${missingCount}`);

        const recordsToUpdate = await col.find(missingRoleFilter).toArray();

        let updatedInventorCount = 0;
        let updatedApplicantCount = 0;
        let unhandledCount = 0;

        for (const doc of recordsToUpdate) {
            const pName = (doc.patentName || '').trim();
            const aName = (doc.applicantName || '').trim();

            let targetRole = null;

            if (institutionRegex.test(pName) || institutionRegex.test(aName)) {
                targetRole = 'Inventor / Co-Inventor';
            } else if (pName.toLowerCase() === aName.toLowerCase()) {
                targetRole = 'Applicant';
            }

            if (targetRole) {
                await col.updateOne(
                    { _id: doc._id },
                    { $set: { facultyRole: targetRole } }
                );

                if (targetRole === 'Inventor / Co-Inventor') {
                    updatedInventorCount++;
                } else {
                    updatedApplicantCount++;
                }
            } else {
                console.warn(`[WARN] Unhandled record ${doc._id} (patentName: "${pName}", applicantName: "${aName}")`);
                unhandledCount++;
            }
        }

        console.log('\n--- Update Results ---');
        console.log(`Updated to "Inventor / Co-Inventor": ${updatedInventorCount}`);
        console.log(`Updated to "Applicant": ${updatedApplicantCount}`);
        console.log(`Unhandled / skipped: ${unhandledCount}`);

        // Post-update verification
        const postMissing = await col.countDocuments(missingRoleFilter);
        const distinctRoles = await col.distinct('facultyRole');
        const roleCounts = {};
        for (const role of distinctRoles) {
            roleCounts[role] = await col.countDocuments({ facultyRole: role });
        }

        console.log('\n--- Post-Update Verification ---');
        console.log(`Records still missing facultyRole: ${postMissing}`);
        console.log('Role distribution:', roleCounts);

        // Samples
        const inventorSample = await col.find({ facultyRole: 'Inventor / Co-Inventor' }).limit(3).project({
            title: 1,
            patentName: 1,
            applicantName: 1,
            facultyRole: 1
        }).toArray();

        const applicantSample = await col.find({ facultyRole: 'Applicant' }).limit(3).project({
            title: 1,
            patentName: 1,
            applicantName: 1,
            facultyRole: 1
        }).toArray();

        console.log('\nSample "Inventor / Co-Inventor" documents:');
        console.log(JSON.stringify(inventorSample, null, 2));

        console.log('\nSample "Applicant" documents:');
        console.log(JSON.stringify(applicantSample, null, 2));

    } catch (err) {
        console.error('Error updating facultyRole:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

updatePatentFacultyRole();
