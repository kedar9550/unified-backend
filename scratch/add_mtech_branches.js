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

        // Find School of Engineering (SOE)
        const soe = await School.findOne({ code: 'SOE' });
        if (!soe) {
            console.error('School of Engineering (SOE) not found!');
            process.exit(1);
        }

        // Find M.Tech Program
        const mtech = await Program.findOne({ code: 'MTECH' });
        if (!mtech) {
            console.error('M.Tech Program not found!');
            process.exit(1);
        }

        const dataToSetup = [
            { deptName: 'Structural Engineering', deptCode: 'SE', branchName: 'Structural Engineering', branchCode: 'SE' },
            { deptName: 'Power Electronics & Drives', deptCode: 'PED', branchName: 'Power Electronics & Drives', branchCode: 'PED' },
            { deptName: 'Thermal Engineering', deptCode: 'TE', branchName: 'Thermal Engineering', branchCode: 'TE' },
            { deptName: 'VLSI Design', deptCode: 'VLSID', branchName: 'VLSI Design', branchCode: 'VLSID' },
            { deptName: 'Computer Science & Engineering (M.Tech)', deptCode: 'MCSE', branchName: 'Computer Science & Engineering', branchCode: 'CSE' },
            { deptName: 'Energy Science & Technology', deptCode: 'EST', branchName: 'Energy Science & Technology', branchCode: 'EST' },
            { deptName: 'AI & ML (M.Tech)', deptCode: 'MAIML', branchName: 'AI & ML', branchCode: 'AIML' },
            { deptName: 'AI & DS (M.Tech)', deptCode: 'MAIDS', branchName: 'AI & DS', branchCode: 'AIDS' }
        ];

        for (const item of dataToSetup) {
            // 1. Create or find Department
            let dept = await Department.findOne({ code: item.deptCode });
            if (!dept) {
                console.log(`Creating Department: ${item.deptName} (${item.deptCode})...`);
                dept = new Department({
                    name: item.deptName,
                    code: item.deptCode,
                    type: 'Academic',
                    schoolId: soe._id,
                    programId: mtech._id
                });
                await dept.save();
            } else {
                console.log(`Department ${item.deptName} (${item.deptCode}) already exists. Updating programId/schoolId...`);
                dept.programId = mtech._id;
                dept.schoolId = soe._id;
                await dept.save();
            }

            // 2. Create or find Branch under M.Tech and this Department
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
            } else {
                console.log(`Branch ${item.branchName} (${item.branchCode}) already exists under M.Tech.`);
            }

            console.log(`Setup complete for: ${item.deptName}`);
        }

        console.log('Setup completed successfully!');
    } catch (error) {
        console.error('Error running setup:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Connection closed.');
    }
}

run();
