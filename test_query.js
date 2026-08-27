require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.UnifiedDb).then(() => {
  const Group = require('./modules/Group/Group.model');
  Group.find({ $expr: { $or: [ { $eq: ['$coordinator.employeeId', '5741'] }, { $eq: ['$coordinator.employeeId', 5741] } ] } }).then(groups => {
    console.log('Found:', groups.length);
    process.exit(0);
  });
});
