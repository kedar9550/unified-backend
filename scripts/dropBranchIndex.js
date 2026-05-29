const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.UnifiedDb;

if (!uri) {
  console.error('Error: UnifiedDb environment variable not found in .env');
  process.exit(1);
}

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB successfully.');
    const db = mongoose.connection.db;
    try {
        // Drop the legacy 'code_1' index on the 'branches' collection
        await db.collection('branches').dropIndex('code_1');
        console.log('Successfully dropped the legacy global branch unique index "code_1".');
    } catch (err) {
        if (err.codeName === 'IndexNotFound' || err.message.includes('index not found')) {
            console.log('Legacy index "code_1" does not exist, nothing to do.');
        } else {
            console.error('Error dropping index "code_1":', err);
        }
    }

    try {
        // Drop the legacy 'programId_1_code_1' index on the 'branches' collection
        await db.collection('branches').dropIndex('programId_1_code_1');
        console.log('Successfully dropped the legacy programId_1_code_1 index.');
    } catch (err) {
        if (err.codeName === 'IndexNotFound' || err.message.includes('index not found')) {
            console.log('Legacy index "programId_1_code_1" does not exist, nothing to do.');
        } else {
            console.error('Error dropping index "programId_1_code_1":', err);
        }
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('MongoDB Connection error:', err);
    process.exit(1);
  });
