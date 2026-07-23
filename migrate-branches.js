const mongoose = require('mongoose');
require('dotenv').config();

async function migrateDirect() {
    try {
        await mongoose.connect(process.env.UnifiedDb || "mongodb://127.0.0.1:27017/unified");
        const db = mongoose.connection.db;
        
        console.log("Running updateMany...");
        const result = await db.collection('branches').updateMany(
            { programId: { $exists: true } },
            [
                { $set: { programIds: ["$programId"] } },
                { $unset: "programId" }
            ]
        );
        console.log(`Matched ${result.matchedCount}, Modified ${result.modifiedCount}`);
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.connection.close();
    }
}

migrateDirect();
