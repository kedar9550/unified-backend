require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.UnifiedDb).then(async () => {
    const Group = require('./modules/Group/Group.model');
    const Events = require('./modules/Events/Events.model');
    
    // Check 5124
    const myGroups5124 = await Group.find({ 'coordinator.employeeId': '5124' }).select('_id');
    const myGroupIds5124 = myGroups5124.map(g => g._id);
    const events5124 = await Events.find({ group: { $in: myGroupIds5124 } });
    console.log('Events for 5124:', events5124.length);
    
    // Check 6698
    const myGroups6698 = await Group.find({ 'coordinator.employeeId': '6698' }).select('_id');
    const myGroupIds6698 = myGroups6698.map(g => g._id);
    const events6698 = await Events.find({ group: { $in: myGroupIds6698 } });
    console.log('Events for 6698:', events6698.length);

    process.exit(0);
});
