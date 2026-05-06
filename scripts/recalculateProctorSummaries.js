const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const mongoURI = process.env.UnifiedDb || 'mongodb://localhost:27017/varahiamma';
mongoose.connect(mongoURI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

const StudentResult = require('../modules/StudentResult/StudentResult.model');
const { updateProctorSummaries } = require('../modules/StudentResult/StudentResult.controller');

async function run() {
    try {
        console.log('Fetching all REGULAR student results...');
        const results = await StudentResult.find({ resultType: 'REGULAR' });
        console.log(`Found ${results.length} results. Recalculating summaries...`);

        if (results.length > 0) {
            // First, clear existing summaries to ensure a clean state
            const ProctorSummary = require('../modules/ProctorSummary/ProctorSummary.model');
            await ProctorSummary.deleteMany({});
            console.log('Cleared existing summaries.');

            await updateProctorSummaries(results);
            console.log('Summaries recalculated successfully.');
        } else {
            console.log('No results found to process.');
        }

    } catch (err) {
        console.error('Error during recalculation:', err);
    } finally {
        mongoose.connection.close();
    }
}

run();
