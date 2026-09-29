const mongoose = require('mongoose');

mongoose.connect('mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0').then(async () => {
    try {
        const Employee = require('./modules/employee/employee.model');
        const UserAppRole = require('./modules/userAppRole/userAppRole.model');
        const Role = require('./modules/role/role.model');

        const registrarUser = await Employee.findOne({ institutionId: '5143' });
        if (registrarUser) {
            const userRoles = await UserAppRole.find({ userId: registrarUser._id }).populate('role');
            console.log("Roles for REGISTRAR (5143):", userRoles.map(r => r.role?.name));
        } else {
            console.log("Registrar not found");
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}).catch(console.error);
