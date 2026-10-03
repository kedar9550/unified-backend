const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/unified').then(async () => {
    const Conference = require('./modules/Conference/Conference.model.js');
    const doc = await Conference.findById('6ac0b264baa90ba67e7fef63');
    console.log('Doc before:', doc.conferenceType, doc.location, doc.presentationMode);
    
    // Simulate what the frontend sends
    const data = {
        conferenceType: doc.conferenceType || '',
        scopusIndexed: doc.scopusIndexed || '',
        presentationMode: doc.presentationMode || '',
        location: doc.location || '',
        publisher: doc.publisher || '',
        issnIsbn: doc.issnIsbn || '',
        month: doc.month || '',
        year: doc.year || '',
        applyingSeedGrant: doc.applyingSeedGrant || 'No',
        applyIncentive: doc.applyIncentive || 'No',
        approvedAmount: doc.approvedAmount || '',
        userAuthorPosition: doc.userAuthorPosition || 1,
        totalAuthors: doc.totalAuthors || 1,
        coAuthors: doc.coAuthors || [],
        title: doc.title || '',
        conferenceName: doc.conferenceName || ''
    };
    
    Object.assign(doc, data);
    try {
        await doc.save();
        console.log('Saved successfully');
    } catch(e) {
        console.log('Validation Error:', e.message);
    }
    process.exit(0);
});
