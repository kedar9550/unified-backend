const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Journal = require('../modules/Journal/Journal.model');

const ALLOWED_JOURNAL_TYPES = ['SCIE', 'SCI', 'ESCI', 'SSCI', 'AHCI'];
const WOS_PRIORITY = ['SCIE', 'SCI', 'SSCI', 'AHCI', 'ESCI'];

const resolveWoSTypeAndStatus = (input) => {
    if (!input) return { journalType: 'None', isWos: 'No' };
    const str = String(input).toUpperCase().trim();
    if (ALLOWED_JOURNAL_TYPES.includes(str)) {
        return { journalType: str, isWos: 'Yes' };
    }
    if (str === 'NONE' || str === '' || str === 'NO' || str === 'NULL' || str === 'UNDEFINED') {
        return { journalType: 'None', isWos: 'No' };
    }
    const foundTypes = new Set();
    ALLOWED_JOURNAL_TYPES.forEach(t => {
        if (str.includes(t)) foundTypes.add(t);
    });
    if (foundTypes.size > 0) {
        const best = WOS_PRIORITY.find(t => foundTypes.has(t)) || 'None';
        return { journalType: best, isWos: best !== 'None' ? 'Yes' : 'No' };
    }
    return { journalType: 'None', isWos: 'No' };
};

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
        console.log(`Found ${journals.length} journals to process.`);

        let updatedCount = 0;
        for (const j of journals) {
            const { journalType: cleanType, isWos } = resolveWoSTypeAndStatus(j.journalType);
            let needsUpdate = false;

            if (j.journalType !== cleanType) {
                console.log(`Journal [${j._id}] (${j.paperTitle?.slice(0, 30)}...): journalType "${j.journalType}" -> "${cleanType}"`);
                j.journalType = cleanType;
                needsUpdate = true;
            }
            if (j.isWos !== isWos) {
                console.log(`Journal [${j._id}]: isWos "${j.isWos}" -> "${isWos}"`);
                j.isWos = isWos;
                needsUpdate = true;
            }

            if (needsUpdate) {
                await Journal.updateOne(
                    { _id: j._id },
                    { $set: { journalType: cleanType, isWos: isWos } }
                );
                updatedCount++;
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} journals.`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
};

runMigration();
