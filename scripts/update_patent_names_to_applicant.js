const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Patent = require('../modules/Patent/Patent.model');

/**
 * Checks if the patentName is one of the preserved values:
 * - Aditya University (or variations like 'Aditya Univeristy')
 * - AUS
 * - Aditya College of Pharmacy (handles variable whitespace)
 */
function shouldPreservePatentName(name) {
    if (!name) return false;
    const trimmed = name.trim();

    // Check for negative phrases first: "Not in AUS", "Not AUS as Applicant", "Not in the name of Aditya University", etc.
    if (/\bnot\b/i.test(trimmed)) {
        return false;
    }

    // Exact or normalized match for AUS
    if (/^aus$/i.test(trimmed)) {
        return true;
    }

    // Match "Aditya University" (or common typo "Aditya Univeristy")
    if (/^aditya\s+universi?ty$/i.test(trimmed)) {
        return true;
    }

    // Match "Aditya College of Pharmacy"
    if (/^aditya\s+college\s+of\s+pharmacy$/i.test(trimmed)) {
        return true;
    }

    return false;
}

async function updatePatentNamesToApplicant() {
    try {
        const dbUri = process.env.UnifiedDb;
        if (!dbUri) {
            console.error('UnifiedDb URI not found in .env');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB successfully.');

        const patents = await Patent.find({}, '_id patentName applicantName title');
        console.log(`Total patents found: ${patents.length}`);

        let preservedCount = 0;
        let updatedCount = 0;
        let alreadyMatchedCount = 0;
        let missingApplicantCount = 0;
        const changes = [];

        for (const p of patents) {
            if (shouldPreservePatentName(p.patentName)) {
                preservedCount++;
            } else {
                const targetName = (p.applicantName || '').trim();
                if (!targetName) {
                    console.warn(`[WARN] Patent ${p._id} has empty applicantName!`);
                    missingApplicantCount++;
                    continue;
                }

                if (p.patentName === targetName) {
                    alreadyMatchedCount++;
                } else {
                    await Patent.updateOne(
                        { _id: p._id },
                        { $set: { patentName: targetName } }
                    );
                    updatedCount++;

                    if (changes.length < 15) {
                        changes.push({
                            id: p._id,
                            title: p.title,
                            oldPatentName: p.patentName,
                            newPatentName: targetName
                        });
                    }
                }
            }
        }

        console.log('\n--- Update Summary ---');
        console.log(`Total Patents Processed: ${patents.length}`);
        console.log(`Preserved as usual (Aditya University / AUS / Aditya College of Pharmacy): ${preservedCount}`);
        console.log(`Already matched applicantName: ${alreadyMatchedCount}`);
        console.log(`Updated patentName to applicantName: ${updatedCount}`);
        console.log(`Missing applicantName: ${missingApplicantCount}`);

        console.log('\nSample Updates (first 15):');
        console.log(JSON.stringify(changes, null, 2));

        // Post-verification: inspect new distinct patentName values
        const newDistinct = await Patent.distinct('patentName');
        console.log('\n--- Post-update distinct patentName count ---', newDistinct.length);

    } catch (error) {
        console.error('Error updating patentName:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

updatePatentNamesToApplicant();
