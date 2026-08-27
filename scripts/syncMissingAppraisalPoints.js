const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const Appraisal = require('../modules/Appraisal/Appraisal.model');
const Employee = require('../modules/Employee/employee.model');
const { syncAppraisalTotals } = require('../utils/appraisalPointSync');

mongoose.connect(process.env.UnifiedDb || "mongodb://127.0.0.1:27017/unified", {
}).then(async () => {
    console.log("Connected to MongoDB. Starting Safe Full Sync...\n");
    
    // Find ALL appraisals (irrespective of status)
    const appraisals = await Appraisal.find({});
    
    console.log(`Found ${appraisals.length} total appraisals. Syncing points...`);
    
    let successCount = 0;
    let failCount = 0;

    for (let app of appraisals) {
        try {
            // Re-sync points directly from source collections, securely preserving HOD edits
            await syncAppraisalTotals(app.facultyId, app.academicYearId);
            successCount++;
        } catch (err) {
            console.error(`Failed to sync for facultyId ${app.facultyId}:`, err);
            failCount++;
        }
    }
    
    console.log(`\n==============================================`);
    console.log(`SYNC COMPLETE`);
    console.log(`Successfully synced: ${successCount}`);
    console.log(`Failed to sync: ${failCount}`);
    console.log(`==============================================\n`);
    
    process.exit(0);
}).catch(err => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
});
