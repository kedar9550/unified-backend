const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/Eventveda').then(async () => {
    const db = mongoose.connection;
    const result = await db.collection('organisationcommittees').updateMany({ role: 'Co-convener' }, { $set: { role: 'Member' } });
    console.log('Modified:', result.modifiedCount);
    mongoose.disconnect();
}).catch(console.error);
