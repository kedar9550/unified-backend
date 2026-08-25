
const mongoose = require('mongoose');
const uri = 'mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0';
mongoose.connect(uri).then(async () => {
    const Appraisal = mongoose.model('Appraisal', new mongoose.Schema({}, { strict: false }));
    const app = await Appraisal.findOne({ status: 'Submitted to Controller of Examinations' });
    console.log('Appraisal:', app._id, app.status);
    
    // Who evaluates this? Usually the config or routing map
    // Let's check the Employee
    
    const Employee = mongoose.model('Employee', new mongoose.Schema({}, { strict: false }));
    const emps = await Employee.find({ designation: { $regex: 'Controller', $options: 'i' } }).select('name designation institutionId roles');
    console.log('Employees with COE designation:');
    emps.forEach(e => console.log(e.name, e.designation, e.institutionId, e.roles));
    
    process.exit(0);
});

