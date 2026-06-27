const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Employee = require('../modules/employee/employee.model');

const run = async () => {
  try {
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected to MongoDB.");

    const userIds = ["Prime", "5741", "Exam_admin", "391"];
    for (const id of userIds) {
      const emp = await Employee.findOne({ institutionId: id });
      if (emp) {
        emp.password = "123456";
        await emp.save();
        console.log(`Updated password for ${id} to "123456".`);
      } else {
        console.log(`User ${id} not found.`);
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

run();
