const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const mongoURI = process.env.UnifiedDb || "mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/UnifiedDb?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0";

async function run() {
    try {
        await mongoose.connect(mongoURI);
        console.log("Connected to MongoDB successfully.");

        const db = mongoose.connection.db;
        const configs = await db.collection('appraisalconfigs').find({}).toArray();
        console.log(`Found ${configs.length} appraisal configurations to migrate.`);

        for (const config of configs) {
            const oldPoints = config.research?.journalPoints || {};
            const newPoints = {
                "IEEE / ASME / ASCE / ACM / FT-50 / Scopus Top 10%": oldPoints["IEEE/ASME/ASCE/ACM/FT-50/Scopus Top 10%"] ?? oldPoints["IEEE / ASME / ASCE / ACM / FT-50 / Scopus Top 10%"] ?? 25,
                "SCIE and Scopus (Q1 or Q2)": oldPoints["SCIE/Scopus (Q1/Q2)"] ?? oldPoints["SCIE and Scopus (Q1 or Q2)"] ?? 20,
                "SCIE or Scopus (Q1 or Q2)": oldPoints["SCIE/Scopus (Q1/Q2) - Co-Author"] ?? oldPoints["SCIE or Scopus (Q1 or Q2)"] ?? 15,
                "Scopus (Q3 or Q4) or ESCI": oldPoints["Scopus (Q3/Q4)/ESCI"] ?? oldPoints["Scopus (Q3 or Q4) or ESCI"] ?? 10
            };

            await db.collection('appraisalconfigs').updateOne(
                { _id: config._id },
                { 
                    $set: { "research.journalPoints": newPoints }
                }
            );
            console.log(`Migrated configuration _id: ${config._id}`);
        }

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
