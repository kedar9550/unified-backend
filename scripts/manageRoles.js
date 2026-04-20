require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

const Role = require('../modules/role/role.model');
const UserAppRole = require('../modules/userAppRole/userAppRole.model');
const User = require('../modules/user/user.model');

const MONGO_URI = process.env.MONGO_URI || "mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/UnifiedDb?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0";
const APP_NAME = process.env.APP_NAME || "UNIFIED_SYSTEM";

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB!");
    } catch (e) {
        console.error("❌ DB connection error:", e.message);
        process.exit(1);
    }
};

const action = process.argv[2];

const run = async () => {
    await connectDB();

    if (action === "create-role") {
        const roleName = process.argv[3];
        if (!roleName) {
            console.error("❌ Please provide a role name. Example: node scripts/manageRoles.js create-role \"SUPER ADMIN\"");
            process.exit(1);
        }

        try {
            let existingRole = await Role.findOne({ name: roleName.toUpperCase(), app: APP_NAME });
            if (existingRole) {
                console.log(`⚠️ Role '${roleName.toUpperCase()}' already exists for app ${APP_NAME}.`);
            } else {
                await Role.create({ name: roleName.toUpperCase(), app: APP_NAME, description: "Manually created role" });
                console.log(`🎉 Successfully created role: '${roleName.toUpperCase()}'`);
            }
        } catch (e) {
            console.error("❌ Error:", e);
        }

    } else if (action === "assign-role") {
        const roleName = process.argv[3];
        const userId = process.argv[4];

        if (!roleName || !userId) {
            console.error("❌ Please provide both role name and user ID. Example: node scripts/manageRoles.js assign-role \"EXAM SECTION\" \"64f9b...\"");
            process.exit(1);
        }

        try {
            const role = await Role.findOne({ name: roleName.toUpperCase(), app: APP_NAME });
            if (!role) {
                console.error(`❌ Role '${roleName.toUpperCase()}' does not exist! Please create it first.`);
                process.exit(1);
            }

            const user = await User.findById(userId);
            if (!user) {
                console.error(`❌ User with ID ${userId} does not exist in the database!`);
                process.exit(1);
            }

            const existingAssignment = await UserAppRole.findOne({ userId: user._id, role: role._id, app: APP_NAME });
            if (existingAssignment) {
                console.log(`⚠️ User ${user.name} already has the '${roleName.toUpperCase()}' role assigned.`);
            } else {
                await UserAppRole.create({
                    userId: user._id,
                    role: role._id,
                    app: APP_NAME
                });
                console.log(`🎉 Successfully assigned '${roleName.toUpperCase()}' to user ${user.name} (${userId})`);
            }

        } catch (e) {
            console.error("❌ Error assigning role:", e.message);
        }

    } else {
        console.log(`Unknown action: ${action}`);
        console.log("Usage Commands:");
        console.log("  node scripts/manageRoles.js create-role \"<RoleName>\"");
        console.log("  node scripts/manageRoles.js assign-role \"<RoleName>\" \"<UserId>\"");
    }

    process.exit(0);
};

run();
