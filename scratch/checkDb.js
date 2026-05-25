const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Journal = require('../modules/Journal/Journal.model');
const Employee = require('../modules/employee/employee.model');
const Role = require('../modules/role/role.model');
const UserAppRole = require('../modules/userAppRole/userAppRole.model');

dotenv.config();

const run = async () => {
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected to DB");

    const journal = await Journal.findOne({});
    console.log(`Journal: ID=${journal._id}, facultyId=${journal.facultyId}, paperTitle="${journal.paperTitle}", status="${journal.status}"`);

    const applicant = await Employee.findById(journal.facultyId);
    console.log(`Applicant details: ID=${applicant._id}, name="${applicant.name}", coreDepartment=${applicant.coreDepartment}, department=${applicant.department}`);

    const userRoles = await UserAppRole.find({}).populate('role');
    for (const ur of userRoles) {
        const emp = await Employee.findById(ur.userId);
        if (emp) {
            console.log(`UserAppRole: empName="${emp.name}", roleName="${ur.role?.name}", departments=${ur.departments}`);
        }
    }

    mongoose.disconnect();
};

run().catch(console.error);
