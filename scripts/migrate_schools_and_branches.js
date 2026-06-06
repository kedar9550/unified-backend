const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.UnifiedDb || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/UnifiedDb';

const Department = require('../modules/academics/department.model');
const Branch = require('../modules/academics/branch.model');

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);
        console.log('Connected to MongoDB.');

        const db = mongoose.connection.db;

        // 1. Drop old unique indexes on branches collection
        console.log('Dropping old unique indexes on branches...');
        const legacyIndexes = [
            'programId_1_departmentId_1_code_1',
            'programId_1_departmentId_1_name_1'
        ];

        for (const idxName of legacyIndexes) {
            try {
                await db.collection('branches').dropIndex(idxName);
                console.log(`Successfully dropped index: ${idxName}`);
            } catch (err) {
                if (err.codeName === 'IndexNotFound') {
                    console.log(`Index ${idxName} does not exist, skipping.`);
                } else {
                    console.error(`Error dropping index ${idxName}:`, err.message);
                }
            }
        }

        // 2. Migrate Departments: schoolId -> schoolIds
        console.log('Migrating departments...');
        const departments = await Department.find({});
        let migratedDepts = 0;

        for (const dept of departments) {
            let updated = false;
            // Initialize schoolIds if it doesn't exist
            if (!dept.schoolIds) {
                dept.schoolIds = [];
            }

            // Copy schoolId into schoolIds if not already present
            if (dept.schoolId) {
                const schoolIdStr = dept.schoolId.toString();
                const exists = dept.schoolIds.some(id => id.toString() === schoolIdStr);
                if (!exists) {
                    dept.schoolIds.push(dept.schoolId);
                    updated = true;
                }
            }

            if (updated) {
                await dept.save();
                migratedDepts++;
            }
        }
        console.log(`Migrated ${migratedDepts} departments.`);

        // 3. Migrate Branches: populate schoolId from parent department
        console.log('Migrating branches...');
        const branches = await Branch.find({});
        let migratedBranches = 0;

        for (const branch of branches) {
            // Only populate schoolId if it is not already set
            if (!branch.schoolId) {
                const dept = await Department.findById(branch.departmentId);
                if (dept) {
                    // Default to department's schoolId or the first school in schoolIds
                    const schoolId = dept.schoolId || (dept.schoolIds && dept.schoolIds[0]);
                    if (schoolId) {
                        branch.schoolId = schoolId;
                        await branch.save();
                        migratedBranches++;
                    }
                }
            }
        }
        console.log(`Migrated ${migratedBranches} branches with schoolId.`);

        console.log('Migration complete successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
