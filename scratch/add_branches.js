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

        // Find B.Tech Program
        const btech = await Program.findOne({ code: 'BTECH' });
        if (!btech) {
            console.error('B.Tech Program not found!');
            process.exit(1);
        }

        const dataToSetup = [
            { name: 'Civil Engineering', code: 'CE' },
            { name: 'Electrical & Electronics Engineering', code: 'EEE' },
            { name: 'Mechanical Engineering', code: 'ME' },
            { name: 'Electronics & Communication Engineering', code: 'ECE' },
            { name: 'Agricultural Engineering', code: 'AG.E' },
            { name: 'Mining Engineering', code: 'MIN.E' },
            { name: 'Petroleum Technology', code: 'PT' },
            { name: 'Data Science', code: 'DS' },
            { name: 'Information Technology', code: 'IT' },
            { name: 'Computer Science & Engineering', code: 'CSE' },
            { name: 'AI & ML', code: 'AIML' },
            { name: 'Freshman Engineering', code: 'FED' }
        ];

        for (const item of dataToSetup) {
            // 1. Create or find Department
            let dept = await Department.findOne({ code: item.code });
            if (!dept) {
                console.log(`Creating Department: ${item.name} (${item.code})...`);
                dept = new Department({
                    name: item.name,
                    code: item.code,
                    type: 'Academic',
                    schoolId: soe._id,
                    programId: btech._id
                });
                await dept.save();
            } else {
                console.log(`Department ${item.name} (${item.code}) already exists. Updating programId/schoolId...`);
                dept.programId = btech._id;
                dept.schoolId = soe._id;
                await dept.save();
            }

            // 2. Create or find Branch under B.Tech and this Department
            let branch = await Branch.findOne({
                programId: btech._id,
                departmentId: dept._id,
                code: item.code
            });

            if (!branch) {
                console.log(`Creating Branch: ${item.name} (${item.code}) under B.Tech...`);
                branch = new Branch({
                    programId: btech._id,
                    departmentId: dept._id,
                    name: item.name,
                    code: item.code
                });
                await branch.save();
            } else {
                console.log(`Branch ${item.name} (${item.code}) already exists under B.Tech.`);
            }

            console.log(`Setup complete for: ${item.name}`);
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
