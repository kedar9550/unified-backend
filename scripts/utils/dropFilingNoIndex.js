const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const uri = process.env.UnifiedDb;

if (!uri) {
    console.error('UnifiedDb environment variable not found');
    process.exit(1);
}

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    const db = mongoose.connection.db;
    try {
        const collection = db.collection('patents');
        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes.map(i => i.name));
        
        for (const index of indexes) {
            if (index.name.includes('filingNo') || Object.keys(index.key).includes('filingNo')) {
                console.log(`Dropping index: ${index.name}`);
                await collection.dropIndex(index.name);
                console.log(`Successfully dropped index ${index.name}`);
            }
        }
    } catch (err) {
        console.error('Error dropping index:', err);
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error', err);
    process.exit(1);
  });
