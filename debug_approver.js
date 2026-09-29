const mongoose = require('mongoose');

mongoose.connect('mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0').then(async () => {
    try {
        const Employee = require('./modules/employee/employee.model');
        const HierarchyMapping = require('./modules/hierarchy/HierarchyMapping.model');
        const UserAppRole = require('./modules/userAppRole/userAppRole.model');
        const Role = require('./modules/role/role.model');

        const emp1275 = await Employee.findOne({ institutionId: '1275' });
        console.log("Emp 1275:", emp1275 ? emp1275._id : "Not Found");

        const mapping = await HierarchyMapping.findOne({ empId: '1275' });
        console.log("HierarchyMapping for 1275:", mapping);

        if (mapping) {
            const role = await Role.findById(mapping.roleId);
            console.log("Mapped Role:", role);

            const roleHolders = await UserAppRole.find({ role: mapping.roleId }).populate('userId');
            console.log("Role Holders:", roleHolders.map(r => r.userId?.institutionId || 'unknown'));
            
            const { getFacultyIdsForApprover } = require('./modules/hierarchy/reportingBoss.helper');
            if (roleHolders.length > 0) {
                 const approverUser = { userId: roleHolders[0].userId._id };
                 const facIds = await getFacultyIdsForApprover(approverUser);
                 console.log("Faculty IDs for Approver:", facIds);
                 console.log("Is 1275's ObjectId in list?", facIds.includes(emp1275._id.toString()));
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}).catch(console.error);
