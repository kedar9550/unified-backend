const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Program = require('./modules/academics/program.model');
const Branch = require('./modules/academics/branch.model');
const Department = require('./modules/academics/department.model');

async function debug() {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log("Connected to DB");

        const programs = await Program.find({});
        console.log("Master Programs:", programs.map(p => p.name));

        const branches = await Branch.find({});
        console.log("Master Branches:", branches.map(b => b.name));

        const depts = await Department.find({});
        console.log("Master Depts:", depts.map(d => d.name));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
