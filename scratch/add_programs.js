const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const School = require('../modules/academics/school.model');
const Program = require('../modules/academics/program.model');

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
        console.log(`Found School of Engineering (SOE) with ID: ${soe._id}`);

        const programsToSetup = [
            { name: 'B.Tech', code: 'BTECH', type: 'UG', durationYears: 4, programPattern: 'SEMESTER' },
            { name: 'M.Tech', code: 'MTECH', type: 'PG', durationYears: 2, programPattern: 'SEMESTER' },
            { name: 'PHD', code: 'PHD', type: 'PHD', durationYears: 3, programPattern: 'SEMESTER' },
            { name: 'MCA', code: 'MCA', type: 'PG', durationYears: 2, programPattern: 'SEMESTER' },
            { name: 'M.Sc', code: 'MSC', type: 'PG', durationYears: 2, programPattern: 'SEMESTER' }
        ];

        for (const progData of programsToSetup) {
            let prog = await Program.findOne({ code: progData.code });
            if (prog) {
                console.log(`Program ${progData.name} (${progData.code}) already exists. Updating schoolId...`);
                prog.schoolId = soe._id;
                await prog.save();
            } else {
                console.log(`Creating Program ${progData.name} (${progData.code})...`);
                prog = new Program({
                    ...progData,
                    schoolId: soe._id
                });
                await prog.save();
            }
            console.log(`Saved: ${prog.name}`);
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
