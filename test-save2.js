const mongoose = require('mongoose');
const Conference = require('./modules/Conference/Conference.model');
require('dotenv').config();

mongoose.connect(process.env.UnifiedDb || 'mongodb://localhost:27017/unified').then(async () => {
    const doc = await Conference.findOne({ _id: '6ac0b264baa90ba67e7fef63' });
    if (!doc) return console.log('No conference found');
    
    // Exact same payload as what frontend sends
    const payload = {
        conferenceType: 'IIT',
        scopusIndexed: 'Yes',
        location: 'India',
        month: 'August',
        year: '2020',
        applyingSeedGrant: 'No',
        applyIncentive: 'No',
        userAuthorPosition: "2",
        totalAuthors: "1",
        coAuthors: [{
            name: "",
            affiliationType: "Select Affiliation",
            affiliation: "",
            empId: "",
            authorPosition: 2,
            CoAuthorType: "faculty"
        }],
        isStudentsInvolved: 'No'
    };
    
    if (payload.coAuthors && Array.isArray(payload.coAuthors)) {
        payload.coAuthors = payload.coAuthors.filter(a => a.name && a.name.trim() !== "" && a.affiliation && a.affiliation.trim() !== "" && a.affiliationType !== "Select Affiliation");
    }

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
