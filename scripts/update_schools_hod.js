require('dotenv').config();
const mongoose = require('mongoose');
const School = require('../modules/academics/school.model');

mongoose.connect(process.env.UnifiedDb).then(async () => {
    console.log('Connected to MongoDB.');
    const updatedTrue = await School.updateMany({ code: { $in: ['SOE', 'SOC'] } }, { $set: { hod: true } });
    console.log('Updated SOE and SOC to hod: true', updatedTrue);
    const updatedFalse = await School.updateMany({ code: { $nin: ['SOE', 'SOC'] } }, { $set: { hod: false } });
    console.log('Updated other schools to hod: false', updatedFalse);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
