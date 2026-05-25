const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Employee = require('../modules/employee/employee.model');
const Role = require('../modules/role/role.model');
const UserAppRole = require('../modules/userAppRole/userAppRole.model');

dotenv.config();

const run = async () => {
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected to DB");

    // Find RVVN Bheema Rao
    const bheema = await Employee.findOne({ name: /BHEEMA/i });
    if (bheema) {
        console.log(`RVVN Bheema Rao coreDept=${bheema.coreDepartment}, dept=${bheema.department}`);
        
        // Find HOD of Bheema's coreDepartment
        const hodsBheema = await UserAppRole.find({
            departments: bheema.coreDepartment
        }).populate('role');
        
        for (const ur of hodsBheema) {
            const h = await Employee.findById(ur.userId);
            if (h) {
                console.log(`HOD for Bheema: name="${h.name}", institutionId="${h.institutionId}", roleName="${ur.role?.name}"`);
            }
        }
    }

    // Find Amalapurapu Kedarnadh
    const kedar = await Employee.findOne({ name: /KEDAR/i });
    if (kedar) {
        console.log(`Amalapurapu Kedarnadh coreDept=${kedar.coreDepartment}, dept=${kedar.department}`);
        
        // Find HOD of Kedar's coreDepartment
        const hodsKedar = await UserAppRole.find({
            departments: kedar.coreDepartment
        }).populate('role');
        
        for (const ur of hodsKedar) {
            const h = await Employee.findById(ur.userId);
            if (h) {
                console.log(`HOD for Kedar: name="${h.name}", institutionId="${h.institutionId}", roleName="${ur.role?.name}"`);
            }
        }
    }

    mongoose.disconnect();
};

run().catch(console.error);
