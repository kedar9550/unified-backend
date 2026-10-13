const mongoose = require('mongoose');
require('dotenv').config({ path: 'd:/Ganesha/Varahiamma/Unified/unified-backend/.env' });

async function migratePhdApplications() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected successfully!");

    const col = mongoose.connection.collection('phdapplications');

    // -------------------------------------------------------------
    // Step 1: Migrate Pursuing Records
    // - Copy admissionOrAwardDate -> pursuingDetails.admissionDate
    // - Set type: 'guide' and entryType: 'Self' if missing
    // - Remove (unset) root admissionOrAwardDate completely
    // -------------------------------------------------------------
    const pursuingFilter = {
      scholarStatus: 'Pursuing',
      pursuingDetails: { $exists: false }
    };

    const pursuingCount = await col.countDocuments(pursuingFilter);
    console.log(`Found ${pursuingCount} pursuing records to migrate.`);

    if (pursuingCount > 0) {
      const pursuingResult = await col.updateMany(
        pursuingFilter,
        [
          {
            $set: {
              type: { $ifNull: ["$type", "guide"] },
              entryType: { $ifNull: ["$entryType", "Self"] },
              pursuingDetails: {
                academicYear: "$academicYear",
                admissionDate: "$admissionOrAwardDate",
                document: "$document",
                status: { $ifNull: ["$status", "Approved"] },
                submittedAt: { $ifNull: ["$createdAt", new Date()] },
                hodComment: { $ifNull: ["$hodComment", ""] },
                rndComment: { $ifNull: ["$rndComment", ""] }
              }
            }
          },
          {
            $unset: "admissionOrAwardDate"
          }
        ]
      );
      console.log(`Successfully migrated ${pursuingResult.modifiedCount} Pursuing records (admissionOrAwardDate removed from root).`);
    }

    // -------------------------------------------------------------
    // Step 2: Migrate Legacy Awarded Record (e.g. 6a870a1aa4b4650ea77607f4)
    // - Copy admissionOrAwardDate -> awardedDetails.awardDate & pursuingDetails.admissionDate
    // - Set type: 'guide' and entryType: 'Self' if missing
    // - Remove (unset) root admissionOrAwardDate completely
    // -------------------------------------------------------------
    const awardedFilter = {
      scholarStatus: 'Awarded',
      awardedDetails: { $exists: false }
    };

    const awardedCount = await col.countDocuments(awardedFilter);
    console.log(`Found ${awardedCount} legacy awarded record(s) to migrate.`);

    if (awardedCount > 0) {
      const awardedResult = await col.updateMany(
        awardedFilter,
        [
          {
            $set: {
              type: { $ifNull: ["$type", "guide"] },
              entryType: { $ifNull: ["$entryType", "Self"] },
              pursuingDetails: {
                academicYear: "$academicYear",
                admissionDate: "$admissionOrAwardDate",
                document: "$document",
                status: "Approved",
                submittedAt: { $ifNull: ["$createdAt", new Date()] },
                hodComment: "",
                rndComment: ""
              },
              awardedDetails: {
                academicYear: "$academicYear",
                awardDate: "$admissionOrAwardDate",
                document: "$document",
                status: { $ifNull: ["$status", "Approved"] },
                submittedAt: { $ifNull: ["$updatedAt", new Date()] },
                hodComment: { $ifNull: ["$hodComment", ""] },
                rndComment: { $ifNull: ["$rndComment", ""] }
              }
            }
          },
          {
            $unset: "admissionOrAwardDate"
          }
        ]
      );
      console.log(`Successfully migrated ${awardedResult.modifiedCount} Awarded record(s) (admissionOrAwardDate removed from root).`);
    }

    // -------------------------------------------------------------
    // Step 3: Verification
    // -------------------------------------------------------------
    const remainingOldRoot = await col.countDocuments({ admissionOrAwardDate: { $exists: true } });
    console.log(`Records still containing root admissionOrAwardDate: ${remainingOldRoot}`);
    console.log("Migration finished successfully!");

    await mongoose.disconnect();
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

migratePhdApplications();
