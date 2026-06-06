const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('../config/db/unifieddb');
const Employee = require('../modules/employee/employee.model');

const run = async () => {
    await connectDB();
    const employees = await Employee.find({}).select('name email institutionId').limit(10).lean();
    console.log("USERS:", JSON.stringify(employees, null, 2));
    process.exit(0);
};

run();
