const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function updatePatentPublishedGranted() {
    try {
        const dbUri = process.env.UnifiedDb;
        if (!dbUri) {
            console.error('UnifiedDb URI not found in .env');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB successfully.');

        const db = mongoose.connection.db;
        const col = db.collection('patents');

        // Pre-update checks
        const total = await col.countDocuments();
        const existingCount = await col.countDocuments({ published: { $exists: true, $ne: null } });
        
        const missingFilter = {
            $or: [
                { published: { $exists: false } },
                { published: null }
            ]
        };
        const missingCount = await col.countDocuments(missingFilter);

        console.log('\n--- Pre-Update Status ---');
        console.log(`Total patents in database: ${total}`);
        console.log(`Patents already containing published/granted (untouched): ${existingCount}`);
        console.log(`Patents missing published object: ${missingCount}`);

        if (missingCount === 0) {
            console.log('No documents need updating. Exiting.');
            return;
        }

        const missingDocs = await col.find(missingFilter).toArray();

        let publishedCount = 0;
        let grantedCount = 0;
        let otherCount = 0;

        const bulkOps = [];

        for (const doc of missingDocs) {
            const rawStatus = (doc.patentStatus || '').trim();
            const isGranted = /^grant(ed)?$/i.test(rawStatus);
            const isPublished = /^publish(ed)?$/i.test(rawStatus);

            let newPatentStatus = rawStatus;
            let publishedObj = null;
            let grantedObj = null;

            if (isGranted) {
                grantedCount++;
                newPatentStatus = 'Granted';

                grantedObj = {
                    academicYear: doc.academicYear || undefined,
                    grantedstatus: 'yes',
                    grantedexpectedamount: doc.approvedAmount != null ? doc.approvedAmount : undefined,
                    grantedincentiveamount: doc.approvedAmount != null ? doc.approvedAmount : undefined,
                    granteddate: doc.dateOfFiling || undefined,
                    submittedDate: doc.createdAt || undefined,
                    applyIncentive: doc.applyIncentive || 'No',
                    applyingSeedGrant: doc.applyingSeedGrant || 'No',
                    status: doc.status || 'Approved',
                    hodComment: doc.hodComment || '',
                    rndComment: doc.rndComment || '',
                    appraisalClaimant: doc.appraisalClaimant || null,
                    appraisalEligible: doc.appraisalEligible || null
                };

                publishedObj = {
                    academicYear: doc.academicYear || undefined,
                    publishedstatus: 'no',
                    applyIncentive: 'No',
                    applyingSeedGrant: 'No',
                    status: '',
                    hodComment: '',
                    rndComment: '',
                    appraisalClaimant: null,
                    appraisalEligible: null
                };
            } else if (isPublished) {
                publishedCount++;
                newPatentStatus = 'Published';

                publishedObj = {
                    academicYear: doc.academicYear || undefined,
                    publishedstatus: 'yes',
                    publishedexpectedamount: doc.approvedAmount != null ? doc.approvedAmount : undefined,
                    publishedincentiveamount: doc.approvedAmount != null ? doc.approvedAmount : undefined,
                    publisheddate: doc.dateOfFiling || undefined,
                    applyIncentive: doc.applyIncentive || 'No',
                    applyingSeedGrant: doc.applyingSeedGrant || 'No',
                    status: doc.status || 'Approved',
                    hodComment: doc.hodComment || '',
                    rndComment: doc.rndComment || '',
                    appraisalClaimant: doc.appraisalClaimant || null,
                    appraisalEligible: doc.appraisalEligible || null
                };

                grantedObj = {
                    academicYear: doc.academicYear || undefined,
                    grantedstatus: 'no',
                    applyIncentive: 'No',
                    applyingSeedGrant: 'No',
                    status: '',
                    hodComment: '',
                    rndComment: '',
                    appraisalClaimant: null,
                    appraisalEligible: null
                };
            } else {
                // The 6 other records (Filed / Design Patent)
                // Treat as published and keep data in published object, but specify current status in root patentStatus
                otherCount++;
                newPatentStatus = rawStatus; // Keep current status in root patentStatus

                publishedObj = {
                    academicYear: doc.academicYear || undefined,
                    publishedstatus: 'yes',
                    publishedexpectedamount: doc.approvedAmount != null ? doc.approvedAmount : undefined,
                    publishedincentiveamount: doc.approvedAmount != null ? doc.approvedAmount : undefined,
                    publisheddate: doc.dateOfFiling || undefined,
                    applyIncentive: doc.applyIncentive || 'No',
                    applyingSeedGrant: doc.applyingSeedGrant || 'No',
                    status: doc.status || 'Approved',
                    hodComment: doc.hodComment || '',
                    rndComment: doc.rndComment || '',
                    appraisalClaimant: doc.appraisalClaimant || null,
                    appraisalEligible: doc.appraisalEligible || null
                };

                grantedObj = {
                    academicYear: doc.academicYear || undefined,
                    grantedstatus: 'no',
                    applyIncentive: 'No',
                    applyingSeedGrant: 'No',
                    status: '',
                    hodComment: '',
                    rndComment: '',
                    appraisalClaimant: null,
                    appraisalEligible: null
                };
            }

            // Clean undefined values inside subdocuments
            Object.keys(publishedObj).forEach(k => {
                if (publishedObj[k] === undefined) delete publishedObj[k];
            });
            Object.keys(grantedObj).forEach(k => {
                if (grantedObj[k] === undefined) delete grantedObj[k];
            });

            bulkOps.push({
                updateOne: {
                    filter: { _id: doc._id },
                    update: {
                        $set: {
                            patentStatus: newPatentStatus,
                            published: publishedObj,
                            granted: grantedObj
                        }
                    }
                }
            });
        }

        console.log(`\nPrepared operations:`);
        console.log(`  - Published records: ${publishedCount}`);
        console.log(`  - Granted records: ${grantedCount}`);
        console.log(`  - Other records (Filed/Design Patent keeping root status): ${otherCount}`);
        console.log(`  - Total operations to execute: ${bulkOps.length}`);

        console.log('\nExecuting bulkWrite...');
        const result = await col.bulkWrite(bulkOps);
        console.log(`bulkWrite completed. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

        // Post-Update Verification
        const postMissing = await col.countDocuments(missingFilter);
        const distinctStatuses = await col.distinct('patentStatus');
        const pubYesCount = await col.countDocuments({ 'published.publishedstatus': 'yes' });
        const pubNoCount = await col.countDocuments({ 'published.publishedstatus': 'no' });
        const grantedYesCount = await col.countDocuments({ 'granted.grantedstatus': 'yes' });
        const grantedNoCount = await col.countDocuments({ 'granted.grantedstatus': 'no' });

        console.log('\n--- Post-Update Verification ---');
        console.log(`Patents still missing published object: ${postMissing}`);
        console.log('Distinct root patentStatus values:', distinctStatuses);
        console.log('Counts by root patentStatus:');
        for (const s of distinctStatuses) {
            console.log(`  ${s}: ${await col.countDocuments({ patentStatus: s })}`);
        }
        console.log('\nSubdocument statuses:');
        console.log(`  published.publishedstatus = "yes": ${pubYesCount}`);
        console.log(`  published.publishedstatus = "no": ${pubNoCount}`);
        console.log(`  granted.grantedstatus = "yes": ${grantedYesCount}`);
        console.log(`  granted.grantedstatus = "no": ${grantedNoCount}`);

        // Sample documents
        console.log('\nSample Updated Published Record:');
        const samplePub = await col.findOne({ patentStatus: 'Published' }, {
            projection: { title: 1, patentStatus: 1, published: 1, granted: 1 }
        });
        console.log(JSON.stringify(samplePub, null, 2));

        console.log('\nSample Updated Granted Record:');
        const sampleGra = await col.findOne({ patentStatus: 'Granted' }, {
            projection: { title: 1, patentStatus: 1, published: 1, granted: 1 }
        });
        console.log(JSON.stringify(sampleGra, null, 2));

        console.log('\nSample Updated Other Record (Filed):');
        const sampleFiled = await col.findOne({ patentStatus: 'Filed' }, {
            projection: { title: 1, patentStatus: 1, published: 1, granted: 1 }
        });
        console.log(JSON.stringify(sampleFiled, null, 2));

        console.log('\nSample Updated Other Record (Design Patent):');
        const sampleDesign = await col.findOne({ patentStatus: 'Design Patent' }, {
            projection: { title: 1, patentStatus: 1, published: 1, granted: 1 }
        });
        console.log(JSON.stringify(sampleDesign, null, 2));

    } catch (err) {
        console.error('Error during migration:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

updatePatentPublishedGranted();
