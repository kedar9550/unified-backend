const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.UnifiedDb;

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const vedaType = await mongoose.connection.db.collection('central_event_types').findOne({ code: 'VEDA' });
  console.log('VEDA Type ID:', vedaType?._id);

  const srcDocs = await mongoose.connection.db.collection('organisationcommittees').find({}).toArray();
  console.log('Found source docs in organisationcommittees:', srcDocs.length);

  const targetColl = mongoose.connection.db.collection('central_event_organisationcommittees');

  let copied = 0;
  for (const doc of srcDocs) {
    const newDoc = {
      ...doc,
      event_type: doc.event_type || 'VEDA',
      typeId: doc.typeId || (vedaType ? vedaType._id : null)
    };
    await targetColl.updateOne(
      { _id: newDoc._id },
      { $set: newDoc },
      { upsert: true }
    );
    copied++;
  }

  const targetCount = await targetColl.countDocuments();
  console.log(`Copied ${copied} documents.`);
  console.log(`Total count in central_event_organisationcommittees: ${targetCount}`);

  const sample = await targetColl.find({}).limit(2).toArray();
  console.log('Sample copied document:', JSON.stringify(sample, null, 2));

  await mongoose.disconnect();
  console.log('Disconnected');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
