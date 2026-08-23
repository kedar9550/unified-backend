const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const Appraisal = require("./modules/Appraisal/Appraisal.model");
const ResourceUtilization = require("./modules/ResourceUtilization/ResourceUtilization.model");
const AppraisalConfig = require("./modules/Appraisal/AppraisalConfig.model");
const { syncAppraisalTotals } = require("./utils/appraisalPointSync");

async function fixAppraisalResourcePoints() {
    try {
        console.log("Connecting to database...");
        await mongoose.connect(process.env.UnifiedDb || "mongodb://localhost:27017/unified");
        console.log("Connected to MongoDB.");

        // Find all appraisals
        const appraisals = await Appraisal.find({});
        console.log(`Found ${appraisals.length} appraisals to process.`);

        let fixedCount = 0;

        for (const appraisal of appraisals) {
            if (appraisal.status === "Draft") {
                // Drafts don't need syncAppraisalTotals. The fix in Appraisal.controller.js 
                // will automatically recalculate them next time the user views them.
                // However, we can run syncAppraisalTotals to force correct DB values just in case.
            }
            
            // Run syncAppraisalTotals to force DB to update
            // syncAppraisalTotals respects existing HOD awarded points, but recalculates pointsClaimed
            await syncAppraisalTotals(appraisal.facultyId, appraisal.academicYearId);
            fixedCount++;
        }

        console.log(`Successfully processed and fixed ${fixedCount} appraisals.`);
        process.exit(0);
    } catch (error) {
        console.error("Error fixing appraisals:", error);
        process.exit(1);
    }
}

fixAppraisalResourcePoints();
