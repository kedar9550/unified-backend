const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Patent = require('../modules/Patent/Patent.model');
const Employee = require('../modules/employee/employee.model');

async function updatePatentApplicantNamesFromFaculty() {
    try {
        const dbUri = process.env.UnifiedDb;
        if (!dbUri) {
            console.error('UnifiedDb URI not found in .env');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB successfully.');

        // Target patents where applicantName is "Aditya University"
        const query = { applicantName: 'Aditya University' };
        const totalMatching = await Patent.countDocuments(query);
        console.log(`Total patents matching applicantName "Aditya University": ${totalMatching}`);

        const patents = await Patent.find(query, '_id facultyId applicantName title')
            .populate('facultyId', 'name institutionId');

        let updatedCount = 0;
        let missingFacultyCount = 0;
        const changes = [];

        for (const patent of patents) {
            if (!patent.facultyId || !patent.facultyId.name) {
                console.warn(`[WARN] Patent ${patent._id} ("${patent.title}") has missing faculty reference.`);
                missingFacultyCount++;
                continue;
            }

            const facultyName = patent.facultyId.name.trim();

            await Patent.updateOne(
                { _id: patent._id },
                { $set: { applicantName: facultyName } }
            );
            updatedCount++;

            if (changes.length < 10) {
                changes.push({
                    id: patent._id,
                    title: patent.title,
                    facultyEmpId: patent.facultyId.institutionId,
                    oldApplicantName: patent.applicantName,
                    newApplicantName: facultyName
                });
            }
        }

        console.log('\n--- Update Summary ---');
        console.log(`Matched: ${patents.length}`);
        console.log(`Updated to Faculty Name: ${updatedCount}`);
        console.log(`Missing Faculty: ${missingFacultyCount}`);
        console.log('\nSample Updates (first 10):');
        console.log(JSON.stringify(changes, null, 2));

        // Verification
        const remainingCount = await Patent.countDocuments({ applicantName: 'Aditya University' });
        console.log(`\nRemaining patents with applicantName "Aditya University": ${remainingCount}`);

    } catch (error) {
        console.error('Error updating patents:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

updatePatentApplicantNamesFromFaculty();
