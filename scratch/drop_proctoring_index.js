const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.UnifiedDb || 'mongodb://127.0.0.1:27017/UnifiedDb';

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    const db = mongoose.connection.db;
    try {
        await db.collection('facultyproctoringentries').dropIndex('facultyId_1_academicYear_1');
        console.log('Dropped legacy index facultyId_1_academicYear_1 successfully.');
    } catch (err) {
        if (err.codeName === 'IndexNotFound') {
            console.log('Index facultyId_1_academicYear_1 does not exist, nothing to do.');
        } else {
            console.error('Error dropping index:', err);
        }
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error', err);
    process.exit(1);
  });
