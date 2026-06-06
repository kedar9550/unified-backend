const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Program = require('../modules/academics/program.model');
const Department = require('../modules/academics/department.model');
const Branch = require('../modules/academics/branch.model');

async function run() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.UnifiedDb);
        console.log('Connected successfully!');

        // Find M.Tech Program
        const mtech = await Program.findOne({ code: 'MTECH' });
        if (!mtech) {
            console.error('M.Tech Program not found!');
            process.exit(1);
        }
        console.log(`Found M.Tech Program with ID: ${mtech._id}`);

        // 1. Delete all branches under M.Tech program
        const branchResult = await Branch.deleteMany({ programId: mtech._id });
        console.log(`Deleted ${branchResult.deletedCount} branches under M.Tech program.`);

        // 2. Delete all departments under M.Tech program
        const deptResult = await Department.deleteMany({ programId: mtech._id });
        console.log(`Deleted ${deptResult.deletedCount} departments under M.Tech program.`);

        console.log('Removal completed successfully!');
    } catch (error) {
        console.error('Error running removal script:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Connection closed.');
    }
}

run();
