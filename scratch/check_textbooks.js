const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const Textbook = require('../modules/Textbook/Textbook.model');

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/unified_db');
        console.log("Connected to DB");
        
        const counts = await Textbook.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
        console.log("Status Counts:", counts);

        const samples = await Textbook.find({}).limit(5).populate('facultyId', 'name');
        console.log("Samples:", samples.map(s => ({ title: s.title, status: s.status, faculty: s.facultyId?.name })));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
