const mongoose = require('mongoose');

require('dotenv').config();

const uri = "mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0";

mongoose.connect(uri).then(async () => {
    try {
        const result = await mongoose.connection.collection('events').updateMany(
            { group: { $exists: true } },
            { $rename: { 'group': 'eventSchool' } }
        );
        console.log('Renamed fields:', result);
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
});
