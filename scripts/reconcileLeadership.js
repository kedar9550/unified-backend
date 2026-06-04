const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const LeadershipRole = require('../modules/leadershipRole/LeadershipRole.model');

const MONGO_URI = process.env.UnifiedDb || process.env.MONGO_URI;

async function run() {
    if (!MONGO_URI) {
        console.error("MONGO_URI / UnifiedDb not found in env!");
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB!");

    console.log("Starting leadership synchronization for all employees...");
    await LeadershipRole.syncAllEmployeesLeadership();
    console.log("✅ Successfully synchronized leadership status for all employees.");
    process.exit(0);
}

run().catch(err => {
    console.error("❌ Reconciliation failed:", err);
    process.exit(1);
});
