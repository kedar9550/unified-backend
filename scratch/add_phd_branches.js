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

        // Find PHD Program
        const phd = await Program.findOne({ code: 'PHD' });
        if (!phd) {
            console.error('PHD Program not found!');
            process.exit(1);
        }

        const dataToSetup = [
            { deptName: 'Civil Engineering', deptCode: 'CE', branchName: 'Civil Engineering', branchCode: 'CE' },
            { deptName: 'Electrical & Electronics Engineering', deptCode: 'EEE', branchName: 'Electrical & Electronics Engineering', branchCode: 'EEE' },
            { deptName: 'Mechanical Engineering', deptCode: 'ME', branchName: 'Mechanical Engineering', branchCode: 'ME' },
            { deptName: 'Electronics & Communication Engineering', deptCode: 'ECE', branchName: 'Electronics & Communication Engineering', branchCode: 'ECE' },
            { deptName: 'Computer Science & Engineering', deptCode: 'CSE', branchName: 'Computer Science & Engineering', branchCode: 'CSE' },
            { deptName: 'Petroleum Technology', deptCode: 'PT', branchName: 'Petroleum Technology', branchCode: 'PT' },
            { deptName: 'Mining Engineering', deptCode: 'MIN.E', branchName: 'Mining Engineering', branchCode: 'MIN.E' },
            { deptName: 'Agricultural Engineering', deptCode: 'AG.E', branchName: 'Agricultural Engineering', branchCode: 'AG.E' },
            { deptName: 'Mathematics', deptCode: 'MATH', branchName: 'Mathematics', branchCode: 'MATH' },
            { deptName: 'Physics', deptCode: 'PHY', branchName: 'Physics', branchCode: 'PHY' },
            { deptName: 'Chemistry', deptCode: 'CHEM', branchName: 'Chemistry', branchCode: 'CHEM' },
            { deptName: 'English', deptCode: 'ENG', branchName: 'English', branchCode: 'ENG' }
        ];

        for (const item of dataToSetup) {
            // 1. Create or find Department under this PHD program
            let dept = await Department.findOne({ code: item.deptCode, programId: phd._id });
            if (!dept) {
                console.log(`Creating Department: ${item.deptName} (${item.deptCode}) under PHD...`);
                dept = new Department({
                    name: item.deptName,
                    code: item.deptCode,
                    type: 'Academic',
                    schoolId: soe._id,
                    programId: phd._id
                });
                await dept.save();
            } else {
                console.log(`Department ${item.deptName} (${item.deptCode}) already exists under PHD. Updating schoolId...`);
                dept.schoolId = soe._id;
                await dept.save();
            }

            // 2. Create or find Branch under PHD and this Department
            let branch = await Branch.findOne({
                programId: phd._id,
                departmentId: dept._id,
                code: item.branchCode
            });

            if (!branch) {
                console.log(`Creating Branch: ${item.branchName} (${item.branchCode}) under PHD...`);
                branch = new Branch({
                    programId: phd._id,
                    departmentId: dept._id,
                    name: item.branchName,
                    code: item.branchCode
                });
                await branch.save();
            } else {
                console.log(`Branch ${item.branchName} (${item.branchCode}) already exists under PHD.`);
            }

            console.log(`Setup complete for PHD: ${item.deptName}`);
        }

        console.log('PHD setup completed successfully!');
    } catch (error) {
        console.error('Error running setup:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Connection closed.');
    }
}

run();
