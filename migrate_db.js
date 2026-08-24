require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        const db = mongoose.connection.db;
        const result = await db.collection('groups').updateMany(
            {}, 
            { $rename: { 'eventCoordinator': 'coordinator' } }
        );
        console.log('Migration Result:', result);
    } catch (err) {
        console.error('Migration Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

migrate();
