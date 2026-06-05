const mongoose = require('mongoose');

const mongoURI = "mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/UnifiedDb?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0";

async function run() {
    try {
        await mongoose.connect(mongoURI);
        console.log("Connected to MongoDB");

        const facultyId = new mongoose.Types.ObjectId("69edced62cc2ad1355d29131");
        const appraisal = await mongoose.connection.db.collection('appraisals').findOne({ facultyId });
        console.log("Appraisal Record:", JSON.stringify(appraisal, null, 2));

        const claim = await mongoose.connection.db.collection('appraisalresearchclaims').find({}).toArray();
        console.log("\nClaims:", claim);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
