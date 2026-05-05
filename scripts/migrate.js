/**
 * MIGRATION SCRIPT
 * Run this ONCE after deploying the new code to:
 * 1. Seed new "YEAR" semester type (for Pharma.D)
 * 2. Populate semType and yearName fields on existing students
 * 3. Fix the ProcterMaping unique index
 *
 * Run: node scripts/migrate.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const SemesterType = require('../modules/semesterType/semesterType.model');
const Student = require('../modules/StudentData/Studentdata.model');
const ProcterMaping = require('../modules/ProcterMaping/ProcterMaping.model');

const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
};

// ── Step 1: Seed YEAR semester type ─────────────────────────────────────────
const seedYearSemesterType = async () => {
    console.log('\n[1/3] Seeding YEAR semester type...');
    const types = ['ODD', 'EVEN', 'SUMMER', 'YEAR'];
    for (const name of types) {
        const existing = await SemesterType.findOne({ name });
        if (!existing) {
            await SemesterType.create({ name });
            console.log(`  ✓ Created: ${name}`);
        } else {
            console.log(`  - Already exists: ${name}`);
        }
    }
};

// ── Step 2: Populate semType and yearName on existing students ───────────────
const migrateStudentSemFields = async () => {
    console.log('\n[2/3] Migrating student semType and yearName fields...');

    const students = await Student.find({
        $or: [
            { 'academicInfo.semType': { $exists: false } },
            { 'academicInfo.semType': null }
        ]
    });

    console.log(`  Found ${students.length} students to migrate`);

    let updated = 0;
    for (const student of students) {
        const sem = student.academicInfo?.semester;
        const program = student.academicInfo?.programName;

        let semType = null;
        let yearName = null;

        if (program === 'Pharma.D') {
            // Pharma.D students — check if they have semester (shouldn't, but handle)
            semType = 'YEAR';
            yearName = null; // Will be set when re-synced from eCap
            // Note: yearName comes from eCap semestername field — re-sync to populate
        } else if (sem !== null && sem !== undefined) {
            semType = sem % 2 !== 0 ? 'ODD' : 'EVEN';
        }

        await Student.updateOne(
            { _id: student._id },
            { $set: { 'academicInfo.semType': semType, 'academicInfo.yearName': yearName } }
        );
        updated++;
    }

    console.log(`  ✓ Migrated ${updated} students`);
};

// ── Step 3: Fix ProcterMaping unique index ───────────────────────────────────
const fixProcterMapingIndex = async () => {
    console.log('\n[3/3] Fixing ProcterMaping unique index...');

    const collection = mongoose.connection.collection('proctermapings');

    // Drop old wrong index
    try {
        await collection.dropIndex('studentId_1_semester_1');
        console.log('  ✓ Dropped old index: studentId_1_semester_1');
    } catch (e) {
        console.log('  - Old index not found (already dropped or renamed):', e.message);
    }

    // Create new correct index
    try {
        await collection.createIndex(
            { studentId: 1, academicYearId: 1, semesterTypeId: 1 },
            { unique: true, name: 'studentId_1_academicYearId_1_semesterTypeId_1' }
        );
        console.log('  ✓ Created new index: studentId + academicYearId + semesterTypeId (unique)');
    } catch (e) {
        console.log('  - Index may already exist:', e.message);
    }
};

// ── Run all migrations ───────────────────────────────────────────────────────
const runMigration = async () => {
    try {
        await connectDB();
        await seedYearSemesterType();
        await migrateStudentSemFields();
        await fixProcterMapingIndex();
        console.log('\n✅ Migration completed successfully!');
        console.log('\nNext steps:');
        console.log('  1. Run student sync (bulkUpdateStudentCSV) to populate yearName for Pharma.D students from eCap');
        console.log('  2. If needed, create program-specific academic years via POST /api/academic-years');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await mongoose.disconnect();
    }
};

runMigration();
