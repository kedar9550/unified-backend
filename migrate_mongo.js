const mongoose = require('mongoose');

const uri = "mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0";

async function run() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB.");

        const db = mongoose.connection.db;

        // Fetch all documents from groups
        const groups = await db.collection('groups').find({}).toArray();
        console.log(`Found ${groups.length} documents in 'groups' collection.`);

        if (groups.length > 0) {
            // Insert them into event_schools
            // Check if event_schools already has data
            const existingCount = await db.collection('event_schools').countDocuments();
            if (existingCount === 0) {
                await db.collection('event_schools').insertMany(groups);
                console.log(`Successfully copied ${groups.length} documents to 'event_schools' collection.`);
            } else {
                console.log(`'event_schools' collection already has ${existingCount} documents. Skipping copy to avoid duplicates.`);
            }
        }
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

run();
