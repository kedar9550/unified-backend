const axios = require('axios');

async function testPut() {
    try {
        const payload = {
            conferenceType: 'IIT',
            scopusIndexed: 'Yes',
            location: 'India',
            month: 'August',
            year: '2020',
            applyingSeedGrant: 'No',
            applyIncentive: 'No',
            userAuthorPosition: 1,
            totalAuthors: 1,
            coAuthors: [],
            isStudentsInvolved: 'No'
        };
        const res = await axios.put('http://localhost:9022/api/hod/research-requests/conference/6ac0b264baa90ba67e7fef63', payload, {
            headers: {
                // we might need a token if auth is required, but let's see if it gives 401 or 500
            }
        });
        console.log("Success:", res.data);
    } catch (e) {
        if (e.response) {
            console.error("Error Status:", e.response.status);
            console.error("Error Data:", e.response.data);
        } else {
            console.error("Network Error:", e.message);
        }
    }
}
testPut();
