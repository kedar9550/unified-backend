const mongoose = require('mongoose');
const Conference = require('./modules/Conference/Conference.model');
require('dotenv').config();

mongoose.connect(process.env.UnifiedDb || 'mongodb://localhost:27017/unified').then(async () => {
    const doc = await Conference.findOne({ _id: '6ac0b264baa90ba67e7fef63' });
    if (!doc) return console.log('No conference found');
    
    // Simulate frontend payload
    const payload = {
        conferenceType: 'IIT',
        scopusIndexed: 'Yes',
        location: 'India',
        month: 'August',
        year: '2020',
        applyingSeedGrant: 'No',
        applyIncentive: 'No',
        userAuthorPosition: 2,
        totalAuthors: 1,
        coAuthors: [], // filtered out
        isStudentsInvolved: 'No',
        title: doc.title,
        conferenceName: doc.conferenceName
    };
    
    Object.assign(doc, payload);
    
    try {
        await doc.save();
        console.log('Saved successfully');
    } catch (e) {
        console.error('ValidationError:', e.message);
        if (e.errors) {
            for (let key in e.errors) {
                console.error(key, e.errors[key].message);
            }
        }
    }
    process.exit(0);
});
