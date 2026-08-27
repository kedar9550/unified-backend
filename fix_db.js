require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.UnifiedDb).then(async () => {
    const db = mongoose.connection.db;
    const groups = await db.collection('groups').find().toArray();
    for (let g of groups) {
        if (g.coordinator && typeof g.coordinator.employeeId === 'number') {
            await db.collection('groups').updateOne(
                { _id: g._id },
                { $set: { 'coordinator.employeeId': g.coordinator.employeeId.toString() } }
            );
            console.log('Fixed:', g.name);
        }
    }
    console.log('Done');
    process.exit(0);
});
