const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/UnifiedDb';

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    const db = mongoose.connection.db;
    try {
        await db.collection('academicyears').dropIndex('year_1');
        console.log('Dropped legacy index year_1 successfully.');
    } catch (err) {
        if (err.codeName === 'IndexNotFound') {
            console.log('Index year_1 does not exist, nothing to do.');
        } else {
            console.error('Error dropping index:', err);
        }
    }
    
    // Also drop program_1 or any others if they exist?
    // Let's just drop year_1 for now.
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error', err);
    process.exit(1);
  });
