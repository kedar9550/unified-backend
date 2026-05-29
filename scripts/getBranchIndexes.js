const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.UnifiedDb;

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    const db = mongoose.connection.db;
    const indexes = await db.collection('branches').indexes();
    console.log('Current indexes on branches collection:');
    console.log(JSON.stringify(indexes, null, 2));
    
    // Also let's check all branches currently in the database to see if there is already a duplicate
    const branches = await db.collection('branches').find({}).toArray();
    console.log('All branches currently in database:');
    console.log(JSON.stringify(branches, null, 2));

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
