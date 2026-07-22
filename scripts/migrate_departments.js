const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log("Connected to DB");
    
    const Department = require('../modules/academics/department.model.js');
    const Branch = require('../modules/academics/branch.model.js');

    // 1. Drop the old indexes
    try {
        await Department.collection.dropIndex('programId_1_code_1');
        console.log("Dropped index: programId_1_code_1");
    } catch (e) {
        console.log("Index programId_1_code_1 not found or already dropped.");
    }
    
    try {
        await Department.collection.dropIndex('programId_1_name_1');
        console.log("Dropped index: programId_1_name_1");
    } catch (e) {
        console.log("Index programId_1_name_1 not found or already dropped.");
    }

    // 2. Migrate Departments
    const departments = await Department.find();
    let updatedCount = 0;
    let deletedBranchesCount = 0;

    for (let dept of departments) {
        const programIdsToLink = new Set();
        
        // Convert old single programId if it exists
        if (dept.programId) {
            programIdsToLink.add(dept.programId.toString());
        }

        // Keep any existing programIds just in case it was already migrated
        if (dept.programIds && dept.programIds.length > 0) {
            dept.programIds.forEach(id => programIdsToLink.add(id.toString()));
        }

        // Find default branches
        const branches = await Branch.find({ departmentId: dept._id });
        const defaultBranches = branches.filter(b => b.name === dept.name && b.code === dept.code);

        for (let b of defaultBranches) {
            if (b.programId) {
                programIdsToLink.add(b.programId.toString());
            }
            // Delete the default branch as it's no longer needed
            await b.deleteOne();
            deletedBranchesCount++;
        }

        // Update the department
        dept.programIds = Array.from(programIdsToLink);
        // Unset old programId field
        dept.programId = undefined;
        
        await dept.save();
        updatedCount++;
    }

    console.log(`Migration completed. Updated ${updatedCount} departments. Deleted ${deletedBranchesCount} default branches.`);
    process.exit(0);
}).catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
