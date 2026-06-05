const mongoose = require('mongoose');

const mongoURI = "mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/UnifiedDb?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0";

const CoAuthorSchema = new mongoose.Schema({
    name: { type: String },
    affiliation: { type: String }
}, { _id: false });

const JournalSchema = new mongoose.Schema({
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
    doi: { type: String, trim: true },
    journalQuartile: { type: String },
    journalType: { type: String },
    paperTitle: { type: String },
    coAuthors: [CoAuthorSchema],
    journalName: { type: String },
    impactFactor: { type: String },
    jcrImpactFactor: { type: String },
    status: { type: String }
}, { collection: 'journals' });

const AppraisalConfigSchema = new mongoose.Schema({
    academicYearId: mongoose.Schema.Types.ObjectId,
    research: mongoose.Schema.Types.Mixed
}, { collection: 'appraisalconfigs' });

// Exact getJournalBasePoints logic from Appraisal.controller.js
async function getJournalBasePoints(j, config) {
    const journalPointsConf = config.research?.journalPoints || {};
    
    // 1. Check if the journal exists in the journalmasters collection (top category)
    let isJournalMaster = false;
    if (j.journalName) {
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = await mongoose.connection.db.collection('journalmasters').findOne({
            title: { $regex: new RegExp(`^${escapeRegExp(j.journalName.trim())}$`, 'i') }
        });
        if (match) {
            isJournalMaster = true;
        }
    }

    if (isJournalMaster) {
        return journalPointsConf["IEEE / ASME / ASCE / ACM / FT-50 / Scopus Top 10%"] ?? 25;
    }

    const type = (j.journalType || "").toUpperCase().trim();
    const quartile = (j.journalQuartile || "").toUpperCase().trim();
    const isSCIE = (type === 'SCI' || type === 'SCIE');
    const isScopus = (type === 'SCOPUS');
    const isQ1orQ2 = (quartile === 'Q1' || quartile === 'Q2');
    const isQ3orQ4 = (quartile === 'Q3' || quartile === 'Q4');
    const isESCI = (type === 'ESCI');

    // 2. SCIE and Scopus (Q1 or Q2)
    if (isSCIE && isQ1orQ2) {
        return journalPointsConf["SCIE and Scopus (Q1 or Q2)"] ?? 20;
    }

    // 3. SCIE or Scopus (Q1 or Q2)
    if (isSCIE || (isScopus && isQ1orQ2)) {
        return journalPointsConf["SCIE or Scopus (Q1 or Q2)"] ?? 15;
    }

    // 4. Scopus (Q3 or Q4) or ESCI
    if (isESCI || (isScopus && isQ3orQ4)) {
        return journalPointsConf["Scopus (Q3 or Q4) or ESCI"] ?? 10;
    }

    // Fallback
    return 10;
}

async function run() {
    try {
        await mongoose.connect(mongoURI);
        console.log("Connected to MongoDB");

        const Journal = mongoose.model('Journal', JournalSchema);
        const AppraisalConfig = mongoose.model('AppraisalConfig', AppraisalConfigSchema);

        const config = await AppraisalConfig.findOne({});
        console.log("\n--- Appraisal Config (Journal Points) ---");
        console.log(JSON.stringify(config.research?.journalPoints, null, 2));

        const titles = [
            "Formulation and in Vitro Evaluation of Niacin 500 Mg Extended Release Tablets",
            "From tradition to opportunity: the sustainable livelihood approach of Jaipur Rugs"
        ];

        for (const title of titles) {
            console.log(`\n--- Evaluating: "${title}" ---`);
            const journal = await Journal.findOne({ paperTitle: new RegExp(title.substring(0, 30), 'i') });
            if (!journal) {
                console.log("Journal not found!");
                continue;
            }

            console.log("Quartile (journalQuartile):", journal.journalQuartile);
            console.log("Journal Type:", journal.journalType);
            console.log("Impact Factor (impactFactor):", journal.impactFactor);
            console.log("JCR Impact Factor (jcrImpactFactor):", journal.jcrImpactFactor);

            const basePoints = await getJournalBasePoints(journal, config);
            let totalPoints = basePoints;
            const jcrIFVal = journal.jcrImpactFactor || journal.impactFactor;
            if (jcrIFVal && Number(jcrIFVal) > 0) {
                totalPoints += Number(jcrIFVal);
            }

            console.log("Calculated Base Points:", basePoints);
            console.log("Calculated Total Points (Base + IF):", totalPoints);
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    }
}

run();
