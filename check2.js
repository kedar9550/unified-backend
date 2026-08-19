const mongoose = require('mongoose');
const url = 'mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0';
mongoose.connect(url).then(async () => {
    const Employee = require('./modules/employee/employee.model');
    const emps = await Employee.find({ designation: /controller/i }).select('institutionId name designation');
    console.log(emps);
    process.exit(0);
});
