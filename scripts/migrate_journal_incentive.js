const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Journal = require('../modules/Journal/Journal.model');
const { calculateJournalIncentive } = require('../utils/journalIncentiveCalculator');

const runMigration = async () => {
    try {
        const mongoUri = process.env.UnifiedDb || process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('MONGO_URI is not defined in .env');
            process.exit(1);
        }
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const journals = await Journal.find({});
        console.log(`Found ${journals.length} journals to process for Estimated Incentive.`);

        let updatedCount = 0;
        for (const j of journals) {
            const dataObj = j.toObject();
            let estimatedAmount = 0;

            if (dataObj.applyIncentive === 'Yes' || dataObj.applyIncentive === 'yes') {
                const calc = calculateJournalIncentive(dataObj);
                estimatedAmount = calc.estimatedIncentiveAmount || 0;
            }

            if (j.estimatedIncentiveAmount !== estimatedAmount) {
                await Journal.updateOne(
                    { _id: j._id },
                    { $set: { estimatedIncentiveAmount: estimatedAmount } }
                );
                updatedCount++;
            }
        }

        console.log(`Migration complete. Updated estimatedIncentiveAmount on ${updatedCount} journals.`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
};

runMigration();
