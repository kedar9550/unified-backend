const { designationRoutingMap } = require('./modules/Appraisal/Appraisal.controller.js');
let expectedEmployeeIds = [];
for (const [empId, mappedRole] of Object.entries(designationRoutingMap)) {
    if (mappedRole === 'Controller of Examinations') {
        expectedEmployeeIds.push(empId);
    }
}
console.log('expectedEmployeeIds:', expectedEmployeeIds);

const mongoose = require('mongoose');
const url = 'mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0';
mongoose.connect(url).then(async () => {
    const Employee = require('./modules/employee/employee.model');
    const instCount = await Employee.countDocuments({ institutionId: { $in: expectedEmployeeIds }, isActive: true });
    console.log('instCount from DB:', instCount);
    
    // Let's also check if they exist without isActive filter
    const instCountAll = await Employee.countDocuments({ institutionId: { $in: expectedEmployeeIds } });
    console.log('instCount from DB (all):', instCountAll);
    
    // Also log the actual docs
    const docs = await Employee.find({ institutionId: { $in: expectedEmployeeIds } }).select('institutionId name isActive');
    console.log('docs:', docs);

    process.exit(0);
});
