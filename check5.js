
const mongoose = require('mongoose');
const uri = 'mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0';
mongoose.connect(uri).then(async () => {
    const Appraisal = mongoose.model('Appraisal', new mongoose.Schema({}, { strict: false }));
    const Employee = mongoose.model('Employee', new mongoose.Schema({}, { strict: false }));
    const app = await Appraisal.findOne({ status: 'Submitted to Controller of Examinations' });
    const emp = await Employee.findById(app.facultyId);
    console.log('Appraisal for:', emp.name, 'Institution ID:', emp.institutionId);
    
    process.exit(0);
});

