
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/unified').then(async () => {
    const Appraisal = mongoose.model('Appraisal', new mongoose.Schema({}, { strict: false }));
    const apps = await Appraisal.find({ status: { $regex: 'Submitted to' } });
    console.log('Appraisals submitted to someone:');
    const grouped = {};
    apps.forEach(a => {
        grouped[a.status] = (grouped[a.status] || 0) + 1;
    });
    console.log(grouped);
    
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const coeRoles = await Role.find({ name: { $regex: 'Controller', $options: 'i' } });
    console.log('COE roles:', coeRoles.map(r => ({id: r._id, name: r.name, key: r.key})));
    
    process.exit(0);
});

