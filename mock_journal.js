const mongoose = require('mongoose');
mongoose.connect('mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/digital_services?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0').then(async () => {
    const Journal = require('./modules/Journal/Journal.model');
    const newJournal = await Journal.create({
        facultyId: new mongoose.Types.ObjectId('6a8699dd56efa201d06ab798'),
        academicYear: new mongoose.Types.ObjectId('69fbda90202b005f04e89e34'),
        college: 'Aditya University',
        panNumber: 'ABCDE1234F',
        doi: '10.1016/j.swevo.mock.6611',
        publicationScope: 'International',
        totalAuthors: 1,
        userAuthorPosition: 1,
        journalQuartile: 'Q1',
        journalType: 'SCIE',
        paperTitle: 'Mock Paper in Swarm and Evolutionary Computation',
        coAuthors: [],
        journalName: 'SWARM AND EVOLUTIONARY COMPUTATION',
        vol: '1',
        issue: '1',
        publishedMonth: 'August',
        publishedYear: '2026',
        hIndex: '50',
        jcrImpactFactor: '9.6',
        citations: '0',
        agecReferencingNumbers: '',
        numberOfReferencesBelongingToAGEC: 0,
        sdgs: 'SDG 9',
        applyingSeedGrant: 'No',
        completeJournalName: 'Swarm and Evolutionary Computation',
        applyIncentive: 'Yes',
        publishedPaper: 'mock_paper.pdf',
        referencePages: 'mock_references.pdf',
        completeJournal: '',
        status: 'Approved',
        appraisalClaimant: null,
        incentiveClaimant: null,
        appraisalEligible: 'Yes'
    });
    console.log('Created Mock Journal Publication:', newJournal._id);
    
    const Appraisal = require('./modules/Appraisal/Appraisal.model');
    await Appraisal.updateOne(
        { facultyId: new mongoose.Types.ObjectId('6a8699dd56efa201d06ab798'), academicYearId: new mongoose.Types.ObjectId('69fbda90202b005f04e89e34') },
        { 
            $push: { 
                'research.papers.items': {
                    paperId: newJournal._id,
                    paperType: 'Journal',
                    title: newJournal.paperTitle,
                    scope: newJournal.publicationScope,
                    doi: newJournal.doi,
                    claimStatus: 'Claimed',
                    claimedBy: '6a8699dd56efa201d06ab798',
                    isMultiAUSAuthor: false,
                    pointsClaimed: 25,
                    impactFactor: 9.6
                }
            },
            $inc: { 'research.papers.totalClaimed': 25, 'research.totalClaimed': 25 }
        }
    );
    console.log('Linked to Appraisal');
    process.exit(0);
}).catch(console.error);
