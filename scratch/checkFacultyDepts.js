const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Employee = require('../modules/employee/employee.model');

dotenv.config();

const run = async () => {
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected to DB");

    const mulaparthi = await Employee.findOne({ name: /MULAPARTHI/i });
    if (mulaparthi) {
        console.log(`MULAPARTHI coreDept=${mulaparthi.coreDepartment}, dept=${mulaparthi.department}`);
    }

    const pantam = await Employee.findOne({ name: /PANTAM/i });
    if (pantam) {
        console.log(`PANTAM coreDept=${pantam.coreDepartment}, dept=${pantam.department}`);
    }

    mongoose.disconnect();
};

run().catch(console.error);
