const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Department = require('../modules/academics/department.model');
const Employee = require('../modules/employee/employee.model');

async function check() {
    try {
        console.log("Connecting to:", process.env.UnifiedDb);
        await mongoose.connect(process.env.UnifiedDb);
        console.log("Connected.");

        const deps = await Department.find({}).limit(5);
        console.log("Departments found:", deps.length);
        deps.forEach(d => console.log(`- ${d.name} (${d._id})`));

        const user = await Employee.findOne({ institutionId: "6611" }).populate('department').populate('coreDepartment');
        if (user) {
            console.log("User found:", user.name);
            console.log("Department:", user.department);
            console.log("Core Department:", user.coreDepartment);
        } else {
            console.log("User 6611 not found");
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
