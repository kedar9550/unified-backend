const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Patent = require('../modules/Patent/Patent.model');
const Employee = require('../modules/employee/employee.model');

async function updatePatentApplicantNames() {
    try {
        const dbUri = process.env.UnifiedDb;
        if (!dbUri) {
            console.error('UnifiedDb URI not found in .env');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB successfully.');

        const totalPatents = await Patent.countDocuments();
        console.log(`Total patents in collection: ${totalPatents}`);

        const patents = await Patent.find({}, '_id facultyId applicantName title').populate('facultyId', 'name institutionId');

        let updatedCount = 0;
        let unchangedCount = 0;
        let missingFacultyCount = 0;
        const changes = [];

        for (const patent of patents) {
            if (!patent.facultyId || !patent.facultyId.name) {
                console.warn(`[WARN] Patent ${patent._id} ("${patent.title}") has missing or invalid facultyId: ${patent.facultyId}`);
                missingFacultyCount++;
                continue;
            }

            const facultyName = patent.facultyId.name.trim();
            const oldApplicantName = patent.applicantName;

            if (oldApplicantName !== facultyName) {
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
                        oldApplicantName: oldApplicantName,
                        newApplicantName: facultyName
                    });
                }
            } else {
                unchangedCount++;
            }
        }

        console.log('\n--- Update Summary ---');
        console.log(`Total Patents Processed: ${patents.length}`);
        console.log(`Successfully Updated: ${updatedCount}`);
        console.log(`Already Up to Date: ${unchangedCount}`);
        console.log(`Missing Faculty Ref: ${missingFacultyCount}`);
        console.log('\nSample Updates (first 10):');
        console.log(JSON.stringify(changes, null, 2));

    } catch (error) {
        console.error('Error updating patents:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

updatePatentApplicantNames();
