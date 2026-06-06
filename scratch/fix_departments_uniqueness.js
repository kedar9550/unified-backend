const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const School = require('../modules/academics/school.model');
const Program = require('../modules/academics/program.model');
const Department = require('../modules/academics/department.model');
const Branch = require('../modules/academics/branch.model');

async function run() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.UnifiedDb);
        console.log('Connected successfully!');

        // 1. Drop old indexes
        const db = mongoose.connection.db;
        console.log('Dropping legacy indexes in departments collection...');
        try {
            await db.collection('departments').dropIndex('name_1');
            console.log('Successfully dropped name_1 index.');
        } catch (err) {
            console.log('Index name_1 did not exist or was already dropped.');
        }

        try {
            await db.collection('departments').dropIndex('code_1');
            console.log('Successfully dropped code_1 index.');
        } catch (err) {
            console.log('Index code_1 did not exist or was already dropped.');
        }

        // Find School of Engineering (SOE)
        const soe = await School.findOne({ code: 'SOE' });
        if (!soe) {
            console.error('SOE School not found!');
            process.exit(1);
        }

        // Find M.Tech Program
        const mtech = await Program.findOne({ code: 'MTECH' });
        if (!mtech) {
            console.error('M.Tech Program not found!');
            process.exit(1);
        }

        // 2. Clean up temporary M.Tech departments & branches
        console.log('Cleaning up temporary M.Tech records...');
        const tempCodes = ['MCSE', 'MAIML', 'MAIDS'];
        for (const code of tempCodes) {
            const dept = await Department.findOne({ code });
            if (dept) {
                await Branch.deleteMany({ departmentId: dept._id });
                await dept.deleteOne();
                console.log(`Deleted temp department/branches for: ${code}`);
            }
        }

        // 3. Re-create M.Tech departments/branches with correct duplicate codes
        const cleanData = [
            { deptName: 'Computer Science & Engineering', deptCode: 'CSE', branchName: 'Computer Science & Engineering', branchCode: 'CSE' },
            { deptName: 'AI & ML', deptCode: 'AIML', branchName: 'AI & ML', branchCode: 'AIML' },
            { deptName: 'AI & DS', deptCode: 'AIDS', branchName: 'AI & DS', branchCode: 'AIDS' }
        ];

        for (const item of cleanData) {
            // Check if department exists under this program specifically
            let dept = await Department.findOne({ code: item.deptCode, programId: mtech._id });
            if (!dept) {
                console.log(`Creating Department: ${item.deptName} (${item.deptCode}) under M.Tech...`);
                dept = new Department({
                    name: item.deptName,
                    code: item.deptCode,
                    type: 'Academic',
                    schoolId: soe._id,
                    programId: mtech._id
                });
                await dept.save();
            }

            let branch = await Branch.findOne({
                programId: mtech._id,
                departmentId: dept._id,
                code: item.branchCode
            });

            if (!branch) {
                console.log(`Creating Branch: ${item.branchName} (${item.branchCode}) under M.Tech...`);
                branch = new Branch({
                    programId: mtech._id,
                    departmentId: dept._id,
                    name: item.branchName,
                    code: item.branchCode
                });
                await branch.save();
            }

            console.log(`Setup complete for M.Tech department/branch: ${item.deptName}`);
        }

        console.log('Migration and cleanup completed successfully!');
    } catch (error) {
        console.error('Error during migration:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Connection closed.');
    }
}

run();
