require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.UnifiedDb).then(async () => {
    const Group = require('./modules/Group/Group.model');
    const Events = require('./modules/Events/Events.model');
    const empId = '6611';
    
    const myGroups = await Group.find({ 'coordinator.employeeId': empId }).select('_id');
    const myGroupIds = myGroups.map(g => g._id);
    console.log('myGroupIds:', myGroupIds);
    
    const filterQuery = {
        $or: [
            { group: { $in: myGroupIds } },
            { 'conveners.employeeId': empId },
            { 'facultyCoordinators.employeeId': empId },
            { 'facultyCoordinator.employeeId': empId }
        ]
    };
    
    const events = await Events.find(filterQuery);
    console.log('events length:', events.length);
    process.exit(0);
});
