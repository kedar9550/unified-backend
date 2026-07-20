const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const Employee = require('../modules/employee/employee.model');

const run = async () => {
  try {
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected to MongoDB.");

    const userIds = ["Prime", "5741", "Exam_admin", "391", "1275"];
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("123456", salt);
    for (const id of userIds) {
      const res = await Employee.updateOne({ institutionId: id }, { $set: { password: hashedPassword } });
      if (res.modifiedCount > 0 || res.matchedCount > 0) {
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
