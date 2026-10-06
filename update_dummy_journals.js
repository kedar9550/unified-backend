const mongoose = require('mongoose');

mongoose.connect('mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0').then(async () => {
    try {
        const Journal = require('./modules/Journal/Journal.model');

        // Update all dummy journals we just created
        const result = await Journal.updateMany(
            { doi: { $regex: /^10\.1234\/dummy/ } },
            { $set: { status: 'Pending' } }
        );
        
        console.log(`Updated ${result.modifiedCount} dummy journals to Pending status.`);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}).catch(console.error);
