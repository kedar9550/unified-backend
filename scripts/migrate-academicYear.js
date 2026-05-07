/**
 * MIGRATION SCRIPT — run ONCE before deploying new schema
 *
 * What it does:
 *  1. Reads all old AcademicYear documents (one per year+program)
 *  2. Groups them by year string → creates new single-doc-per-year structure
 *  3. Saves new docs to a temp collection "academicyears_new"
 *  4. Updates ALL refs in FacultySubjectResult, FacultyFeedbackResult,
 *     Discrepancy, ProctorSummary, Textbook to point to the new year-level _id
 *  5. Drops old collection, renames new one
 *
 * Run with:
 *   node scripts/migrate-academicYear.js
 *
 * Safe to re-run — it checks if migration already done.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
    await mongoose.connect('mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/UnifiedDb?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const oldCol = db.collection('academicyears');
    const newCol = db.collection('academicyears_new');

    // ── Safety check: already migrated? ───────────────────────────────
    const sample = await oldCol.findOne({});
    if (!sample) {
        console.log('⚠️  academicyears collection is empty — nothing to migrate.');
        await mongoose.disconnect();
        return;
    }
    if (sample.programs !== undefined) {
        console.log('✅ Migration already done (programs array found). Skipping.');
        await mongoose.disconnect();
        return;
    }

    // ── Step 1: Read all old docs ──────────────────────────────────────
    const oldDocs = await oldCol.find({}).toArray();
    console.log(`📄 Found ${oldDocs.length} old records`);

    // ── Step 2: Group by year string ──────────────────────────────────
    const grouped = {};
    for (const doc of oldDocs) {
        const y = doc.year;
        if (!grouped[y]) {
            grouped[y] = {
                year: y,
                programs: [],
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt
            };
        }
        if (doc.programId) {
            grouped[y].programs.push({
                programId: doc.programId,
                isActive: doc.isActive || false,
                activeSemesterTypeId: doc.activeSemesterTypeId || null
            });
        }
    }

    const newDocs = Object.values(grouped).map(d => ({
        ...d,
        _id: new mongoose.Types.ObjectId()
    }));

    console.log(`🗂  Grouped into ${newDocs.length} year-level documents`);

    // ── Step 3: Insert into temp collection ───────────────────────────
    await newCol.deleteMany({});   // clear if previous partial run
    await newCol.insertMany(newDocs);
    console.log(`✅ Inserted ${newDocs.length} docs into academicyears_new`);

    // Build old _id → new _id mapping
    // Each old doc (year+programId) maps to the new year-level doc _id
    const oldToNew = {};
    for (const oldDoc of oldDocs) {
        const newDoc = newDocs.find(n => n.year === oldDoc.year);
        if (newDoc) {
            oldToNew[oldDoc._id.toString()] = newDoc._id;
        }
    }

    // ── Step 4: Update refs in all dependent collections ─────────────
    const collections = [
        'facultysubjectresults',
        'facultyfeedresults',
        'discrepancies',
        'proctorsummaries',
        'textbooks'
    ];

    // Map field names per collection
    const fieldMap = {
        facultysubjectresults: 'academicYearId',
        facultyfeedresults: 'academicYearId',
        discrepancies: 'academicYearId',
        proctorsummaries: 'academicYearId',
        textbooks: 'academicYear'
    };

    for (const colName of collections) {
        const col = db.collection(colName);
        const count = await col.countDocuments();
        if (count === 0) {
            console.log(`  ⏭  ${colName}: empty, skip`);
            continue;
        }

        let updated = 0;
        const field = fieldMap[colName];
        const allRecs = await col.find({ [field]: { $exists: true } }).toArray();

        for (const rec of allRecs) {
            const oldId = rec[field]?.toString();
            const newId = oldToNew[oldId];
            if (newId && newId.toString() !== oldId) {
                await col.updateOne(
                    { _id: rec._id },
                    { $set: { [field]: newId } }
                );
                updated++;
            }
        }
        console.log(`  ✅ ${colName}: updated ${updated}/${allRecs.length} refs`);
    }

    // ── Step 5: Swap collections ──────────────────────────────────────
    await oldCol.drop();
    console.log('🗑  Dropped old academicyears collection');

    await newCol.rename('academicyears');
    console.log('✅ Renamed academicyears_new → academicyears');

    // Add unique index on year
    const finalCol = db.collection('academicyears');
    await finalCol.createIndex({ year: 1 }, { unique: true });
    console.log('✅ Created unique index on year');

    console.log('\n🎉 Migration complete!\n');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
