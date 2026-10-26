const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Journal = require('../../modules/Journal/Journal.model');
const Employee = require('../../modules/employee/employee.model');
const AcademicYear = require('../../modules/academicYear/academicYear.model');
const JournalMaster = require('../../modules/JournalMaster/JournalMaster.model');

// Connect to MongoDB
mongoose.connect(process.env.UnifiedDb || 'mongodb://localhost:27017/unified').then(() => {
    console.log('Connected to MongoDB');
    processCSV();
}).catch(err => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
});

async function processCSV() {
    const results = [];
    const csvFilePath = path.join(__dirname, 'journals.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    // Validate Template
    const fileContent = fs.readFileSync(csvFilePath, 'utf8').toLowerCase();
    if (!fileContent.includes('journal name')) {
        console.log('Parsed 0 rows');
        console.log('Error processing row 0: Invalid Template Format! Please upload the correct CSV template for Journals.');
        process.exit(0);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'college', 'panNumber', 'paperTitle', 'doi',
        'journalName', 'issn', 'eissn', 'isScopus', 'journalQuartile', 'journalType',
        'journalCategory', 'volume', 'issue', 'pageNos', 'publishedMonth', 'publishedYear',
        'hIndex', 'citations', 'jcrImpactFactor', 'sdgs', 'totalAuthors', 'facultyAuthorPosition',
        'correspondingAuthor', 'isStudentsInvolved', 'applyingSeedGrant', 'applyIncentive',
        'estimatedIncentiveAmount', 'approvedAmount', 'appraisalEligible',
        'co1', 'co2', 'co3', 'co4', 'co5', 'co6', 'co7', 'co8'
    ];

    fs.createReadStream(csvFilePath)
        .pipe(csv({ skipLines: 2, headers: headers }))
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            console.log(`Parsed ${results.length} rows from CSV`);
            
            for (let i = 0; i < results.length; i++) {
                const row = results[i];
                console.log(`Processing row ${i + 1}...`);
                
                try {
                    // 1. Find Faculty Employee
                    const empId = row['empId'] ? row['empId'].trim() : null;
                    if (!empId) {
                        console.log(`Skipping row ${i + 1}: No Faculty Employee ID`);
                        continue;
                    }
                    
                    const faculty = await Employee.findOne({ institutionId: empId });
                    if (!faculty) {
                        console.log(`Skipping row ${i + 1}: Faculty with ID ${empId} not found`);
                        continue;
                    }

                    // 2. Find Academic Year
                    const yearStr = row['academicYear'] ? row['academicYear'].trim() : null;
                    if (!yearStr) {
                         console.log(`Skipping row ${i + 1}: No Academic Year`);
                         continue;
                    }
                    const academicYear = await AcademicYear.findOne({ year: yearStr });
                    if (!academicYear) {
                        console.log(`Skipping row ${i + 1}: Academic Year ${yearStr} not found`);
                        continue;
                    }

                    // 3. Process Co-authors
                    const coAuthors = [];
                    for (let pos = 1; pos <= 8; pos++) {
                        const coAuthorEmpId = row[`co${pos}`] ? row[`co${pos}`].trim() : null;
                        if (coAuthorEmpId) {
                            let empName = `Employee ${coAuthorEmpId}`;
                            let affiliation = 'Aditya';
                            
                            try {
                                const { fetchStaffFromEcap } = require('../../utils/ecapService');
                                const staffData = await fetchStaffFromEcap(coAuthorEmpId);
                                if (staffData && (staffData.employeename || staffData.EmployeeName)) {
                                    empName = staffData.employeename || staffData.EmployeeName;
                                    affiliation = staffData.college || 'Aditya';
                                }
                            } catch (apiErr) {
                                console.log(`API lookup failed for ${coAuthorEmpId}`);
                            }

                            coAuthors.push({
                                name: empName,
                                affiliation: affiliation,
                                employeeId: coAuthorEmpId,
                                authorPosition: pos,
                                CoAuthorType: 'faculty'
                            });
                        }
                    }

                    // 4. Prepare Journal Object
                    const rawJType = (row['journalType'] || '').toUpperCase().trim();
                    const validJTypes = ['SCIE', 'SCI', 'ESCI', 'SSCI', 'AHCI'];
                    const cleanJType = validJTypes.find(t => rawJType.includes(t)) || (rawJType === 'NONE' ? 'None' : 'None');
                    const isWos = cleanJType !== 'None' ? 'Yes' : 'No';

                    const rawQuartile = (row['journalQuartile'] || '').toUpperCase().trim();
                    const validQuartiles = ['Q1', 'Q2', 'Q3', 'Q4'];
                    const cleanQuartile = validQuartiles.find(q => rawQuartile.includes(q)) || (rawQuartile === 'NONE' ? 'None' : 'None');

                    const rawScopus = (row['isScopus'] || '').trim().toLowerCase();
                    const isScopus = rawScopus === 'no' ? 'No' : 'Yes';

                    const rawCorresponding = (row['correspondingAuthor'] || '').trim().toLowerCase();
                    const correspondingAuthor = rawCorresponding === 'yes' ? 'Yes' : 'No';

                    const rawStudents = (row['isStudentsInvolved'] || '').trim().toLowerCase();
                    const isStudentsInvolved = rawStudents === 'yes' ? 'Yes' : 'No';

                    // Journal Category (from CSV, or lookup JournalMaster, or fallback)
                    let rawCategory = (row['journalCategory'] || '').trim().toUpperCase();
                    const validCategories = ['IEEE', 'ASME', 'ASCE', 'ACM', 'OTHERS'];
                    let journalCategory = validCategories.find(c => c === rawCategory);
                    if (!journalCategory) {
                        const cleanIssn = (row['issn'] || '').trim();
                        const cleanEissn = (row['eissn'] || '').trim();
                        let jmMatch = null;
                        if (cleanIssn || cleanEissn) {
                            const jmOrConds = [];
                            if (cleanIssn) jmOrConds.push({ issn: cleanIssn }, { eissn: cleanIssn });
                            if (cleanEissn) jmOrConds.push({ issn: cleanEissn }, { eissn: cleanEissn });
                            jmMatch = await JournalMaster.findOne({ $or: jmOrConds });
                        }
                        if (!jmMatch && row['journalName']) {
                            jmMatch = await JournalMaster.findOne({ journalTitle: new RegExp(`^${row['journalName'].trim()}$`, 'i') });
                        }
                        journalCategory = (jmMatch && jmMatch.type) ? jmMatch.type : (rawCategory || 'OTHERS');
                    }

                    // Applying Seed Grant
                    const rawSeedGrant = (row['applyingSeedGrant'] || '').trim().toLowerCase();
                    const applyingSeedGrant = rawSeedGrant === 'yes' ? 'Yes' : 'No';

                    // Apply Incentive
                    const rawIncentive = (row['applyIncentive'] || '').trim().toLowerCase();
                    const applyIncentive = rawIncentive === 'yes' ? 'Yes' : 'No';

                    // Estimated Incentive Amount
                    let estimatedIncentiveAmount = 0;
                    if (row['estimatedIncentiveAmount'] !== undefined && row['estimatedIncentiveAmount'] !== null && String(row['estimatedIncentiveAmount']).trim() !== '') {
                        const parsedEst = Number(row['estimatedIncentiveAmount']);
                        if (!isNaN(parsedEst)) {
                            estimatedIncentiveAmount = parsedEst;
                        }
                    }

                    // Approved Amount
                    let approvedAmount = undefined;
                    if (row['approvedAmount'] !== undefined && row['approvedAmount'] !== null && String(row['approvedAmount']).trim() !== '') {
                        const parsedApp = Number(row['approvedAmount']);
                        if (!isNaN(parsedApp)) {
                            approvedAmount = parsedApp;
                        }
                    }

                    // Appraisal Eligible
                    const rawAppraisal = (row['appraisalEligible'] || '').trim().toLowerCase();
                    const appraisalEligible = rawAppraisal === 'no' ? 'No' : 'Yes';

                    let rawDoi = (row['doi'] || '').trim();
                    let isNoDoi = 'No';
                    if (!rawDoi || rawDoi.toLowerCase() === 'no doi' || rawDoi.toLowerCase() === 'n/a') {
                        rawDoi = `NoDOI-${empId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                        isNoDoi = 'Yes';
                    }

                    const journalData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || faculty.college || '',
                        panNumber: row['panNumber'] || '',
                        doi: rawDoi,
                        isNoDoi: isNoDoi,
                        issn: (row['issn'] || '').trim(),
                        eissn: (row['eissn'] || '').trim(),
                        isScopus: isScopus,
                        isWos: isWos,
                        journalQuartile: cleanQuartile,
                        journalType: cleanJType,
                        journalCategory: journalCategory,
                        paperTitle: (row['paperTitle'] || 'Unknown Title').trim(),
                        journalName: (row['journalName'] || 'Unknown Journal').trim(),
                        vol: (row['volume'] || '').trim(),
                        issue: (row['issue'] || '').trim(),
                        pageNos: (row['pageNos'] || '').trim(),
                        publishedMonth: (row['publishedMonth'] || 'JAN').trim().toUpperCase(),
                        publishedYear: (row['publishedYear'] || yearStr.split('-')[0]).trim(),
                        hIndex: (row['hIndex'] || '').trim(),
                        citations: (row['citations'] || '').trim(),
                        jcrImpactFactor: (row['jcrImpactFactor'] || '').trim(),
                        sdgs: (row['sdgs'] || '').trim(),
                        totalAuthors: Number(row['totalAuthors']) || 1,
                        userAuthorPosition: Number(row['facultyAuthorPosition']) || 1,
                        correspondingAuthor: correspondingAuthor,
                        isStudentsInvolved: isStudentsInvolved,
                        applyingSeedGrant: applyingSeedGrant,
                        applyIncentive: applyIncentive,
                        estimatedIncentiveAmount: estimatedIncentiveAmount,
                        approvedAmount: approvedAmount,
                        appraisalEligible: appraisalEligible,
                        appraisalClaimant: (appraisalEligible === 'No' || coAuthors.length > 0) ? null : faculty.institutionId,
                        incentiveClaimant: applyIncentive === 'Yes' ? faculty.institutionId : null,
                        coAuthors: coAuthors,
                        
                        // Default fields required by DB
                        isInstitutionRecord: 'No',
                        entryType: 'Admin',
                        status: 'Approved',
                        publishedPaper: 'placeholder.pdf',
                        completeJournal: 'placeholder.pdf',
                        referencePages: null
                    };

                    // 5. Save to DB
                    const query = {
                        $or: [
                            { paperTitle: journalData.paperTitle }
                        ]
                    };
                    if (isNoDoi === 'No') {
                        query.$or.push({ doi: journalData.doi });
                    }

                    const existingJournal = await Journal.findOne(query);
                    if (existingJournal) {
                        console.log(`Skipping row ${i + 1}: Already exists (Duplicate title or DOI)`);
                    } else {
                        await Journal.create(journalData);
                        console.log(`Created new Journal entry for ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}: ${err.message || err}`);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
