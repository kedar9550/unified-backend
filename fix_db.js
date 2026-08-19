
const mongoose = require('mongoose');
const url = 'mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0';
mongoose.connect(url).then(async () => {
    const Appraisal = require('./modules/Appraisal/Appraisal.model');
    const badStatuses = await Appraisal.find({ status: /Controlelr/ }).countDocuments();
    const goodStatuses = await Appraisal.find({ status: /Controller/ }).countDocuments();
    console.log('Bad:', badStatuses, 'Good:', goodStatuses);
    
    if(badStatuses > 0) {
        const badDocs = await Appraisal.find({ status: /Controlelr/ });
        for (let doc of badDocs) {
            doc.status = doc.status.replace('Controlelr', 'Controller');
            await doc.save();
        }
        console.log('Fixed bad statuses');
    }
    
    process.exit(0);
});

