const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Employee = require('../modules/employee/employee.model');
const Department = require('../modules/academics/department.model');

async function fixUser() {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log("Connected to DB.");

        const id = "6611";
        const response = await axios.get(`https://info.aec.edu.in/adityaAPI/API/staffdata/${id}`);
        const ecapData = response.data?.[0];

        if (!ecapData) {
            console.log("No ECAP data found for 6611");
            process.exit(1);
        }

        const ecapDept = (ecapData.departmentname || ecapData.department || ecapData.DepartmentName || ecapData.Department)?.trim();
        console.log("Detected Department String:", ecapDept);

        if (!ecapDept) {
            console.log("Could not detect department string from ECAP data.");
            process.exit(1);
        }

        const deptRecord = await Department.findOne({
            $or: [
                { name: new RegExp(`^${ecapDept}$`, 'i') },
                { code: new RegExp(`^${ecapDept}$`, 'i') }
            ]
        });

        if (!deptRecord) {
            console.log(`Department '${ecapDept}' not found in system.`);
            // List all departments to help debug
            const all = await Department.find({});
            console.log("Available departments:");
            all.forEach(a => console.log(`- ${a.name}`));
            process.exit(1);
        }

        console.log("Found matching Department record:", deptRecord.name, `(${deptRecord._id})`);

        const updated = await Employee.findOneAndUpdate(
            { institutionId: id },
            { $set: { department: deptRecord._id, coreDepartment: deptRecord._id } },
            { new: true }
        );

        console.log("User updated successfully.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixUser();
