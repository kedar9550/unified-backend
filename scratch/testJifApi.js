const mongoose = require('mongoose');
const dotenv = require('dotenv');
const JournalImpactFactor = require('../modules/JournalImpactFactor/JournalImpactFactor.model');

dotenv.config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log('Connected to DB for validation.');

        // Test Find
        const records = await JournalImpactFactor.find({}).limit(5).lean();
        console.log('Found records:', records);
        if (records.length === 0) {
            console.error('Test Failed: No JIF entries found.');
            process.exit(1);
        }

        // Test search logic
        const query = {
            $or: [
                { journalName: /LANCET/i },
                { abbreviatedJournal: /LANCET/i },
                { publisher: /LANCET/i }
            ]
        };
        const searchRes = await JournalImpactFactor.find(query).lean();
        console.log('Search for LANCET results:', searchRes);
        if (searchRes.length === 0 || searchRes[0].journalName !== 'LANCET') {
            console.error('Test Failed: Search did not return LANCET.');
            process.exit(1);
        }

        console.log('All backend schema and query tests passed successfully!');
        process.exit(0);
    } catch (e) {
        console.error('Error during verification test:', e);
        process.exit(1);
    }
};

runTest();
