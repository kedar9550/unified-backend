require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function fixAppraisalPoints() {
    try {
        console.log("Connecting to database...");
        await mongoose.connect(process.env.UnifiedDb);
        console.log("Connected successfully.");

        const Appraisal = require('../modules/Appraisal/Appraisal.model');
        const { syncAppraisalTotals } = require('../utils/appraisalPointSync');

        // Find all appraisals
        const appraisals = await Appraisal.find({}).lean();
        console.log(`Found ${appraisals.length} appraisals. Running sync for each...`);

        let successCount = 0;
        let failCount = 0;

        for (const app of appraisals) {
            try {
                const facultyId = app.facultyId;
                const academicYearId = app.academicYearId;

                if (!facultyId || !academicYearId) {
                    console.log(`Skipping appraisal ${app._id} (Missing facultyId or academicYearId)`);
                    continue;
                }

                await syncAppraisalTotals(facultyId, academicYearId);
                successCount++;
            } catch (err) {
                console.error(`Error syncing appraisal ${app._id}:`, err);
                failCount++;
            }
        }

        console.log(`\n============================`);
        console.log(`Migration Complete!`);
        console.log(`Successfully synced: ${successCount}`);
        console.log(`Failed to sync: ${failCount}`);
        console.log(`============================\n`);

        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

fixAppraisalPoints();
