const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Student = require('./modules/StudentData/Studentdata.model');
const Department = require('./modules/academics/department.model');

async function debug() {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log("Connected to DB");

        const studentCount = await Student.countDocuments({});
        console.log("Total students:", studentCount);

        const assignedCount = await Student.countDocuments({ "academicInfo.department": { $ne: null } });
        console.log("Assigned students:", assignedCount);

        const programs = await Student.distinct("academicInfo.programName", { "academicInfo.department": { $ne: null } });
        console.log("Assigned Programs:", programs);

        const branches = await Student.distinct("academicInfo.branch", { "academicInfo.department": { $ne: null } });
        console.log("Assigned Branches:", branches);

        const deptIds = await Student.distinct("academicInfo.department", { "academicInfo.department": { $ne: null } });
        const depts = await Department.find({ _id: { $in: deptIds } });
        console.log("Assigned Depts:", depts.map(d => d.name));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
