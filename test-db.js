const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ReferenceJournal = require('./modules/ReferenceJournal/ReferenceJournal.model');

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        const count = await ReferenceJournal.countDocuments({});
        console.log("Total reference journals:", count);
        const docs = await ReferenceJournal.find({}).limit(5).lean();
        console.log("Sample documents:", JSON.stringify(docs, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

test();
