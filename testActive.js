const mongoose = require('mongoose');
require('dotenv').config();

const AcademicYear = require('./modules/academicYear/academicYear.model');

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/UnifiedDb';

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Find all B.Tech programs
    const Program = require('./modules/academics/program.model');
    const btech = await Program.findOne({ name: /B\.Tech/i });
    if (!btech) {
        console.log('B.Tech not found');
        process.exit(0);
    }
    
    const years = await AcademicYear.find({ programId: btech._id });
    console.log('Found years for B.Tech:', years.map(y => ({ year: y.year, isActive: y.isActive })));
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error', err);
    process.exit(1);
  });
