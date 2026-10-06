const mongoose = require('mongoose');

mongoose.connect('mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0').then(async () => {
    try {
        const Employee = require('./modules/employee/employee.model');
        const Journal = require('./modules/Journal/Journal.model');
        const AcademicYear = require('./modules/academicYear/academicYear.model');

        // Find active academic year
        const activeYear = await AcademicYear.findOne({ status: 'active' }) || await AcademicYear.findOne();
        if (!activeYear) {
            console.error('No academic year found!');
            process.exit(1);
        }

        const emps = ['5910', '1275'];
        
        for (let i = 0; i < emps.length; i++) {
            const empId = emps[i];
            const emp = await Employee.findOne({ institutionId: empId });
            
            if (!emp) {
                console.log(`Employee ${empId} not found. Skipping.`);
                continue;
            }
            
            console.log(`Creating dummy journal for ${emp.name} (${empId})`);
            
            await Journal.create({
                facultyId: emp._id,
                academicYear: activeYear._id,
                college: 'Aditya University',
                panNumber: 'DUMMYPAN' + empId,
                doi: `10.1234/dummy.${empId}.${Date.now()}`,
                publicationScope: 'International',
                totalAuthors: 1,
                userAuthorPosition: 1,
                journalQuartile: 'Q1',
                journalType: 'SCI',
                paperTitle: `Dummy Paper for Testing ${empId}`,
                coAuthors: [],
                journalName: 'TEST JOURNAL OF TESTING',
                vol: '1',
                issue: '1',
                publishedMonth: 'September',
                publishedYear: '2026',
                hIndex: '10',
                jcrImpactFactor: '5.0',
                citations: '0',
                agecReferencingNumbers: '',
                numberOfReferencesBelongingToAGEC: 0,
                sdgs: 'SDG 4',
                applyingSeedGrant: 'No',
                completeJournalName: 'Test Journal of Testing',
                applyIncentive: 'Yes',
                publishedPaper: 'dummy_paper.pdf',
                referencePages: 'dummy_references.pdf',
                completeJournal: '',
                status: 'Approved',
                isScopus: 'No',
                appraisalClaimant: null,
                incentiveClaimant: null,
                appraisalEligible: 'Yes'
            });
            console.log(`Successfully created journal for ${empId}`);
        }
        
        console.log('Done!');
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}).catch(console.error);
