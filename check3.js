
const mongoose = require('mongoose');
const uri = 'mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0';
mongoose.connect(uri).then(async () => {
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const roles = await Role.find({ name: { $regex: 'Controller', $options: 'i' } });
    console.log('COE roles:', roles.map(r => ({id: r._id, name: r.name})));
    
    for (const r of roles) {
        const users = await User.find({ roles: r._id }).select('name email roles').populate('roles');
        console.log('Users with role', r.name, ':', users.map(u => u.name));
    }
    process.exit(0);
});

