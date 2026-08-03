const mongoose = require("mongoose");
const dotenv = require("dotenv");
const FacultyAdministration = require("./modules/FacultyAdministration/FacultyAdministration.model");
const Appraisal = require("./modules/Appraisal/Appraisal.model");

dotenv.config();

const MIGRATION_MAP = {
    "Deans / Assoc Deans / CoE": { roleId: "dean", roleLabel: "Dean" },
    "HoD / Dy. CoE / Coordinator (Univ. Office)": { roleId: "hod", roleLabel: "Head of the Department" },
    "Dy. HoD / Dept. Exam Cell Incharge": { roleId: "dy_hod", roleLabel: "Deputy HoD" },
    "Time Table / Project Coordinator / Curriculum Coordinator": { roleId: "timetable_coord", roleLabel: "Time Table Coordinator" },
    "Placement / Internship / Alumni Coordinator": { roleId: "placement_coord", roleLabel: "Placement Coordinator" },
    "Coursera / LinkedIn Coordinator / ALA": { roleId: "coursera_coord", roleLabel: "Coursera Coordinator" },
    "EDC / IIC / IQAC Coordinator": { roleId: "edc_coord", roleLabel: "EDC Coordinator" },
    "Course Coordinator": { roleId: "course_coord", roleLabel: "Course Coordinator" },
    "Website Coordinator": { roleId: "website_coord", roleLabel: "Website Coordinator" },
    "NSS / Any Clubs / Professional Chapters Coordinator": { roleId: "nss_coord", roleLabel: "NSS Coordinator" },
    "Any Training Program Coordinator (Smart Interviews / GPP / Etc.)": { roleId: "training_coord", roleLabel: "Training Program Coordinator (Smart Interviews / GPP / etc.)" },
    "DRC / Research Coordinator": { roleId: "drc_coord", roleLabel: "DRC Coordinator" },
    "Anti-Ragging Committee Coordinator": { roleId: "antiragging_coord", roleLabel: "Anti-Ragging Committee Coordinator" },
    // "Any other remarkable event / activity coordinator" is dynamic, see below
};

const connectDB = require("./config/db/unifieddb");

async function migrateAdminRoles() {
    try {
        await connectDB();
        console.log("Connected to MongoDB via unifieddb");

        // 1. Migrate FacultyAdministration records
        const adminEntries = await FacultyAdministration.find({});
        let adminUpdated = 0;

        for (let entry of adminEntries) {
            let modified = false;
            for (let role of entry.roles) {
                if (!role.roleId) {
                    if (role.roleName && MIGRATION_MAP[role.roleName]) {
                        role.roleId = MIGRATION_MAP[role.roleName].roleId;
                        role.roleLabel = MIGRATION_MAP[role.roleName].roleLabel;
                    } else {
                        role.roleId = "other";
                        role.roleLabel = role.roleName || "Unknown Role"; // keep original text as label or fallback
                    }
                    modified = true;
                }
                
                // Map old level "Institute level" to "Central"
                if (role.level === "Institute level") {
                    role.level = "Central";
                    modified = true;
                } else if (role.level === "Department level") {
                    role.level = "Department";
                    modified = true;
                }
            }
            if (modified) {
                entry.markModified("roles");
                await entry.save();
                adminUpdated++;
            }
        }
        console.log(`Migrated ${adminUpdated} FacultyAdministration entries.`);

        // 2. Migrate Appraisal records
        const appraisalEntries = await Appraisal.find({});
        let appraisalUpdated = 0;

        for (let app of appraisalEntries) {
            let modified = false;
            if (app.administration && app.administration.items) {
                for (let item of app.administration.items) {
                    if (!item.roleId) {
                        if (item.activityName && item.activityName.startsWith("Any other remarkable event")) {
                            item.roleId = "other";
                            modified = true;
                        } else if (item.activityName && MIGRATION_MAP[item.activityName]) {
                            item.roleId = MIGRATION_MAP[item.activityName].roleId;
                            item.activityName = MIGRATION_MAP[item.activityName].roleLabel;
                            modified = true;
                        }
                    }
                }
            }
            if (modified) {
                app.markModified("administration.items");
                await app.save();
                appraisalUpdated++;
            }
        }
        console.log(`Migrated ${appraisalUpdated} Appraisal entries.`);

        console.log("Migration complete.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrateAdminRoles();
