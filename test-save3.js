const mongoose = require('mongoose');
const Conference = require('./modules/Conference/Conference.model');
require('dotenv').config();

mongoose.connect(process.env.UnifiedDb || 'mongodb://localhost:27017/unified').then(async () => {
    const doc = await Conference.findById('6ac0b264baa90ba67e7fef63');
    if (!doc) return console.log('No conference found');
    
    // Exactly what frontend sends when clicking Save
    const payload = {
        conferenceType: 'IIT',
        scopusIndexed: 'Yes',
        location: 'India',
        publisher: doc.publisher || '',
        issnIsbn: doc.issnIsbn || '',
        month: 'August',
        year: '2020',
        applyingSeedGrant: 'No',
        applyIncentive: 'No',
        userAuthorPosition: 1,
        totalAuthors: 1,
        coAuthors: doc.coAuthors || [],
        isStudentsInvolved: 'No',
        title: doc.title,
        conferenceName: doc.conferenceName
    };
    
    if (payload.coAuthors && Array.isArray(payload.coAuthors)) {
        payload.coAuthors = payload.coAuthors.filter(a => a.name && a.name.trim() !== "" && a.affiliation && a.affiliation.trim() !== "" && a.affiliationType !== "Select Affiliation");
    }

    Object.assign(doc, payload);
    
    try {
        await doc.validate();
        console.log('Validation successful!');
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
