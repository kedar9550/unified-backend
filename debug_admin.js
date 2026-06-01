const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('./config/db/unifieddb');
// Require model files to register schemas in mongoose
require('./modules/employee/employee.model');
const FacultyAdministration = require('./modules/FacultyAdministration/FacultyAdministration.model');

const run = async () => {
    await connectDB();
    const entries = await FacultyAdministration.find({}).populate('facultyId', 'name email');
    console.log("TOTAL ENTRIES:", entries.length);
    for (const e of entries) {
        console.log(`Faculty: ${e.facultyId?.name} (${e.facultyId?.email}), Status: ${e.status}`);
        console.log("Roles:");
        e.roles.forEach(r => {
            if (r.isResponsible) {
                console.log(` - [YES] ${r.roleName} (Level: ${r.level}, Details: ${r.details})`);
            } else {
                // If it's saved in DB as NO
                console.log(` - [NO] ${r.roleName}`);
            }
        });
    }
    process.exit(0);
};

run();
