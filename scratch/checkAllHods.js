const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Employee = require('../modules/employee/employee.model');
const Role = require('../modules/role/role.model');
const UserAppRole = require('../modules/userAppRole/userAppRole.model');

dotenv.config();

const run = async () => {
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected to DB");

    const hods = await UserAppRole.find({}).populate('role');
    for (const ur of hods) {
        if (ur.role && /HOD/i.test(ur.role.name)) {
            const emp = await Employee.findById(ur.userId);
            if (emp) {
                console.log(`HOD: "${emp.name}", ID=${emp._id}`);
                for (const deptId of ur.departments) {
                    const dept = await mongoose.connection.db.collection('departments').findOne({ _id: deptId });
                    console.log(`  Dept Mapped: ID=${deptId}, name="${dept ? dept.name : 'Unknown'}"`);
                }
            }
        }
    }

    mongoose.disconnect();
};

run().catch(console.error);
