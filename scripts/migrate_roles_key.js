const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Assuming role model path
const Role = require('../modules/role/role.model');
const connectDB = require('../config/db/unifieddb');

const migrate = async () => {
    try {
        await connectDB();
        console.log("Connected to DB, starting migration...");

        const roles = await Role.find({});
        console.log(`Found ${roles.length} roles to process.`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const role of roles) {
            // Check if key already exists (in case it's run multiple times)
            if (role.key) {
                console.log(`Role ${role.name} already has key: ${role.key}. Skipping.`);
                skippedCount++;
                continue;
            }

            // Generate key from name
            const newKey = role.name.replace(/ /g, '_').toUpperCase();

            await Role.updateOne(
                { _id: role._id },
                { $set: { key: newKey } }
            );

            console.log(`Updated role ${role.name} with key: ${newKey}`);
            updatedCount++;
        }

        console.log(`Migration complete. Updated: ${updatedCount}, Skipped: ${skippedCount}`);
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

migrate();
