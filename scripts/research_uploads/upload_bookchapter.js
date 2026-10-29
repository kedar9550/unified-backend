const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const BookChapter = require('../../modules/BookChapter/BookChapter.model');
const Employee = require('../../modules/employee/employee.model');
const AcademicYear = require('../../modules/academicYear/academicYear.model');

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
    const csvFilePath = path.join(__dirname, 'bookchapters.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    // Validate Template
    const fileContent = fs.readFileSync(csvFilePath, 'utf8').toLowerCase();
    if (!fileContent.includes('chapter title')) {
        console.log('Parsed 0 rows');
        console.log('Error processing row 0: Invalid Template Format! Please upload the correct CSV template for Book Chapters.');
        process.exit(0);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'college', 'panNumber', 'chapterTitle',
        'textBookName', 'publisher', 'isbnNumber', 'doi', 'totalBookChapter',
        'servingAsEditor', 'scopusIndexed', 'publicationScope', 'yearOfPublication',
        'month', 'numberOfPages', 'totalAuthors', 'facultyAuthorPosition',
        'isStudentsInvolved', 'applyingSeedGrant', 'applyIncentive',
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
                            let affiliation = 'Aditya University';
                            
                            try {
                                const { fetchStaffFromEcap } = require('../../utils/ecapService');
                                const staffData = await fetchStaffFromEcap(coAuthorEmpId);
                                if (staffData && (staffData.employeename || staffData.EmployeeName)) {
                                    empName = staffData.employeename || staffData.EmployeeName;
                                    affiliation = staffData.college || 'Aditya University';
                                }
                            } catch (apiErr) {
                                console.log(`API lookup failed for ${coAuthorEmpId}`);
                            }

                            coAuthors.push({
                                name: empName,
                                affiliation: affiliation,
                                employeeId: coAuthorEmpId,
                                authorPosition: pos.toString(),
                                CoAuthorType: 'faculty'
                            });
                        }
                    }

                    // 4. Prepare BookChapter Object
                    let rawDoi = (row['doi'] || '').trim();
                    if (!rawDoi || rawDoi.toLowerCase() === 'n/a' || rawDoi.toLowerCase() === 'no doi') {
                        rawDoi = undefined;
                    }

                    const rawScopus = (row['scopusIndexed'] || '').trim().toLowerCase();
                    let scopusIndexed = 'Not Available';
                    if (rawScopus === 'yes') scopusIndexed = 'Yes';
                    else if (rawScopus === 'no') scopusIndexed = 'No';

                    const rawEditor = (row['servingAsEditor'] || '').trim().toLowerCase();
                    const servingAsEditor = rawEditor === 'yes' ? 'Yes' : 'No';

                    const rawScope = (row['publicationScope'] || '').trim().toLowerCase();
                    const publicationScope = rawScope.includes('international') ? 'International' : 'National';

                    const rawStudents = (row['isStudentsInvolved'] || '').trim().toLowerCase();
                    const isStudentsInvolved = rawStudents === 'yes' ? 'Yes' : 'No';

                    const rawPages = parseInt(row['numberOfPages'], 10);
                    const numberOfPages = isNaN(rawPages) ? null : rawPages;

                    const totalBookChapter = (row['totalBookChapter'] ? String(row['totalBookChapter']).trim() : '1') || '1';

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

                    // Appraisal Claimant & Incentive Claimant rules
                    const hasOtherAusAuthors = coAuthors.length > 0;
                    const appraisalClaimant = (appraisalEligible === 'No' || hasOtherAusAuthors) ? null : faculty.institutionId;
                    const incentiveClaimant = applyIncentive === 'Yes' ? faculty.institutionId : null;

                    const bookChapterData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || faculty.college || '',
                        panNumber: row['panNumber'] || '',
                        chapterTitle: (row['chapterTitle'] || 'Unknown Title').trim(),
                        doi: rawDoi,
                        textBookName: (row['textBookName'] || 'Unknown Textbook').trim(),
                        isbnNumber: (row['isbnNumber'] || '').trim(),
                        totalBookChapter: totalBookChapter,
                        servingAsEditor: servingAsEditor,
                        scopusIndexed: scopusIndexed,
                        publicationScope: publicationScope,
                        yearOfPublication: (row['yearOfPublication'] || yearStr.split('-')[0]).trim(),
                        month: (row['month'] || 'JAN').trim().toUpperCase(),
                        year: (row['yearOfPublication'] || yearStr.split('-')[0]).trim(),
                        publisher: (row['publisher'] || 'Unknown Publisher').trim(),
                        numberOfPages: numberOfPages,
                        totalAuthors: (row['totalAuthors'] ? String(row['totalAuthors']).trim() : '1'),
                        userAuthorPosition: (row['facultyAuthorPosition'] ? String(row['facultyAuthorPosition']).trim() : '1'),
                        isStudentsInvolved: isStudentsInvolved,
                        coAuthors: coAuthors,
                        
                        // Seed Grant, Incentive & Appraisal fields
                        applyingSeedGrant: applyingSeedGrant,
                        applyIncentive: applyIncentive,
                        estimatedIncentiveAmount: estimatedIncentiveAmount,
                        approvedAmount: approvedAmount,
                        appraisalEligible: appraisalEligible,
                        appraisalClaimant: appraisalClaimant,
                        incentiveClaimant: incentiveClaimant,

                        // Default fields required by DB
                        coverPage: 'placeholder.pdf',
                        authorAffiliation: 'placeholder.pdf',
                        index: 'placeholder.pdf',
                        softCopy: 'placeholder.pdf',
                        status: 'Approved',
                        entryType: 'Admin'
                    };

                    // 5. Save to DB
                    const query = {
                        $or: [
                            { chapterTitle: bookChapterData.chapterTitle }
                        ]
                    };
                    if (bookChapterData.doi) {
                        query.$or.push({ doi: bookChapterData.doi });
                    }

                    const existingChapter = await BookChapter.findOne(query);
                    if (existingChapter) {
                        console.log(`Skipping row ${i + 1}: Already exists (Duplicate Chapter Title or DOI)`);
                    } else {
                        await BookChapter.create(bookChapterData);
                        console.log(`Created new Book Chapter entry for ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}: ${err.message || err}`);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
