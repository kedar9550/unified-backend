const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Department = require('../modules/academics/department.model.js');
    const result = await Department.updateMany({}, { $unset: { schoolId: 1 } });
    console.log('DB Update result:', result);
    process.exit(0);
}).catch(console.error);
