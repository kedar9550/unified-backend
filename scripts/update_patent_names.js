const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Patent = require('../modules/Patent/Patent.model');

function isRelatedToAditya(name) {
    if (!name) return false;
    const trimmed = name.trim();
    // Exclude negative / "Not" phrases
    if (/\bnot\b/i.test(trimmed)) {
        return false;
    }
    // Check if it refers to Aditya University, Aditya College of Pharmacy, or AEC
    if (/aditya/i.test(trimmed)) {
        return true;
    }
    if (/^aec$/i.test(trimmed)) {
        return true;
    }
    return false;
}

async function updatePatentNames() {
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

        let keptCount = 0;
        let updatedCount = 0;
        let alreadyMatchedCount = 0;
        const updatedList = [];

        for (const p of patents) {
            if (isRelatedToAditya(p.patentName)) {
                keptCount++;
            } else {
                const targetName = (p.applicantName || '').trim();
                if (!targetName) {
                    console.warn(`[WARN] Patent ${p._id} has empty applicantName!`);
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
                    if (updatedList.length < 10) {
                        updatedList.push({
                            id: p._id,
                            title: p.title,
                            oldPatentName: p.patentName,
                            newPatentName: targetName
                        });
                    }
                }
            }
        }

        console.log('\n--- Execution Summary ---');
        console.log(`Total Patents Processed: ${patents.length}`);
        console.log(`Kept as usual (Aditya-related): ${keptCount}`);
        console.log(`Updated to applicantName: ${updatedCount}`);
        console.log(`Already exact match with applicantName: ${alreadyMatchedCount}`);
        console.log('\nSample Updates (first 10):');
        console.log(JSON.stringify(updatedList, null, 2));

    } catch (err) {
        console.error('Error during update:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

updatePatentNames();
