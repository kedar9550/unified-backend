const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('./config/db/unifieddb');

const fixData = async () => {
    await connectDB();
    const EmployeeAppRole = require('./modules/userAppRole/userAppRole.model');
    const Employee = require('./modules/employee/employee.model');
    const Role = require('./modules/role/role.model');

    const hods = await Employee.find({ name: { $regex: /Bheema Rao/i } });
    if (hods.length > 0) {
        const hod = hods[0];
        console.log("Fixing HOD ID:", hod._id);
        
        // Add "IT Applications" department to this HOD
        const validDeptId = new mongoose.Types.ObjectId("69f97f06dc60ff91139eeed2");
        
        const mappings = await EmployeeAppRole.find({ userId: hod._id }).populate('role');
        for (const m of mappings) {
            if (m.role?.name === 'HOD') {
                if (!m.departments.includes(validDeptId)) {
                    m.departments.push(validDeptId);
                    await m.save();
                    console.log("Added valid department to HOD's mapping!");
                } else {
                    console.log("HOD already has the valid department.");
                }
            }
        }
    }
    process.exit(0);
};

fixData();
