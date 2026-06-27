const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const Employee = require('../modules/employee/employee.model');
const UserAppRole = require('../modules/userAppRole/userAppRole.model');
const Role = require('../modules/role/role.model');

const run = async () => {
  try {
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected to MongoDB.");

    const employees = await Employee.find({}).limit(100);
    const userRoles = await UserAppRole.find({}).populate('role');

    console.log(`Found ${employees.length} employees and ${userRoles.length} roles associations.`);

    // Group roles by employee ID
    const rolesMap = {};
    for (const uar of userRoles) {
      if (!uar.role || !uar.userId) continue;
      const empId = uar.userId.toString();
      if (!rolesMap[empId]) rolesMap[empId] = [];
      rolesMap[empId].push(uar.role.name);
    }

    const rolesNeeded = ["UNIPRIME", "EXAMSECTION", "HOD", "FACULTY"];
    const foundUsers = {};

    for (const emp of employees) {
      const empIdStr = emp._id.toString();
      const roles = rolesMap[empIdStr] || [];
      for (const roleNeeded of rolesNeeded) {
        if (roles.includes(roleNeeded) && !foundUsers[roleNeeded]) {
          foundUsers[roleNeeded] = {
            id: emp.institutionId,
            name: emp.name,
            email: emp.email,
            phone: emp.phone,
            roles: roles,
          };
        }
      }
    }

    console.log("Found Users per Role:");
    console.log(JSON.stringify(foundUsers, null, 2));

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

run();
