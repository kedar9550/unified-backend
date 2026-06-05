const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const mongoURI = process.env.UnifiedDb || "mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/UnifiedDb?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0";

async function run() {
    try {
        await mongoose.connect(mongoURI);
        console.log("Connected to MongoDB successfully.");

        const db = mongoose.connection.db;
        
        // Update all documents in journals collection that have impactFactor field
        const result = await db.collection('journals').updateMany(
            { impactFactor: { $exists: true } },
            { $rename: { "impactFactor": "jcrImpactFactor" } }
        );

        console.log(`Successfully migrated ${result.modifiedCount} journal documents.`);
        console.log("Database migration completed.");
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
