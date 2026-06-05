const mongoose = require('mongoose');
const mongoURI = 'mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/UnifiedDb?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0';

async function test() {
    await mongoose.connect(mongoURI);
    const db = mongoose.connection.db;

    // 1. Insert mock journal master
    await db.collection('journalmasters').insertOne({ title: 'Nature Biotech', type: 'FT50' });

    // 2. Mock journal
    const mockJournal = { journalName: '  Nature Biotech  ', journalType: 'SCOPUS', journalQuartile: 'Q1' };

    // 3. Evaluate base points matching logic
    let isJournalMaster = false;
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = await db.collection('journalmasters').findOne({
        title: { $regex: new RegExp('^' + escapeRegExp(mockJournal.journalName.trim()) + '$', 'i') }
    });
    if (match) isJournalMaster = true;

    console.log('Is Journal Master matched?', isJournalMaster);
    console.log('Points assigned:', isJournalMaster ? 25 : 0);

    // 4. Cleanup
    await db.collection('journalmasters').deleteOne({ title: 'Nature Biotech' });
    await mongoose.disconnect();
}
test();
