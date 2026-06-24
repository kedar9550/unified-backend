const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Appraisal = require('./modules/Appraisal/Appraisal.model');

mongoose.connect(process.env.UnifiedDb).then(async () => {
    console.log("Connected to MongoDB");

    try {
        const result = await Appraisal.updateMany(
            {},
            {
                $rename: {
                    "research.hIndex2024": "research.hIndexPrevYear",
                    "research.hIndex2025": "research.hIndexCurrentYear"
                }
            }
        );
        console.log(`Successfully migrated hIndex fields. Modified ${result.modifiedCount} documents.`);
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        mongoose.disconnect();
    }
}).catch(err => {
    console.error("Connection error:", err);
});
