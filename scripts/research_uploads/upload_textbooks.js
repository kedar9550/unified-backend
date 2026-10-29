const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Textbook = require('../../modules/Textbook/Textbook.model');
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
    const csvFilePath = path.join(__dirname, 'textbooks.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    // Validate Template
    const fileContent = fs.readFileSync(csvFilePath, 'utf8').toLowerCase();
    if (!fileContent.includes('book title')) {
        console.log('Parsed 0 rows');
        console.log('Error processing row 0: Invalid Template Format! Please upload the correct CSV template for Textbooks.');
        process.exit(0);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'college', 'title', 'publisher',
        'isbn', 'publicationScope', 'edition', 'yearOfPublication', 'month',
        'cost', 'currencySymbol', 'numberOfPages', 'scopusIndexed',
        'totalAuthors', 'facultyAuthorPosition', 'isStudentsInvolved',
        'applyingSeedGrant', 'applyIncentive', 'estimatedIncentiveAmount',
        'approvedAmount', 'appraisalEligible',
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
                    const authors = [];
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

                            authors.push({
                                authorPosition: pos,
                                authorName: empName,
                                affiliationType: affiliation,
                                employeeId: coAuthorEmpId,
                                affiliationName: affiliation,
                                isIncentiveApplicant: false,
                                contributorOnly: true,
                                CoAuthorType: 'faculty'
                            });
                        }
                    }

                    // 4. Prepare Textbook Object
                    let editionNum = parseInt(row['edition'], 10);
                    if (isNaN(editionNum) || editionNum < 1) {
                        editionNum = 1;
                    }

                    const rawScope = (row['publicationScope'] || '').trim().toLowerCase();
                    const publicationScope = rawScope.includes('international') ? 'International' : 'National';

                    const rawScopus = (row['scopusIndexed'] || '').trim().toLowerCase();
                    const scopusIndexed = rawScopus === 'yes' ? 'Yes' : 'No';

                    const rawStudents = (row['isStudentsInvolved'] || '').trim().toLowerCase();
                    const isStudentsInvolved = rawStudents === 'yes' ? 'Yes' : 'No';

                    const rawPages = parseInt(row['numberOfPages'], 10);
                    const numberOfPages = isNaN(rawPages) ? null : rawPages;

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
                    const hasOtherAusAuthors = authors.length > 0;
                    const appraisalClaimant = (appraisalEligible === 'No' || hasOtherAusAuthors) ? null : faculty.institutionId;
                    const incentiveClaimant = applyIncentive === 'Yes' ? faculty.institutionId : null;

                    const textbookData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || faculty.college || 'AUS',
                        title: (row['title'] || 'Unknown Title').trim(),
                        publisher: (row['publisher'] || 'Unknown Publisher').trim(),
                        isbn: (row['isbn'] || `ISBN-${Date.now()}-${i}`).trim(),
                        publicationScope: publicationScope,
                        edition: editionNum,
                        yearOfPublication: (row['yearOfPublication'] || yearStr.split('-')[0]).trim(),
                        month: (row['month'] || 'JAN').trim().toUpperCase(),
                        year: (row['yearOfPublication'] || yearStr.split('-')[0]).trim(),
                        cost: row['cost'] ? String(row['cost']).trim() : '',
                        currencySymbol: (row['currencySymbol'] || '₹').trim(),
                        numberOfPages: numberOfPages,
                        scopusIndexed: scopusIndexed,
                        totalAuthors: Number(row['totalAuthors']) || 1,
                        userAuthorPosition: Number(row['facultyAuthorPosition']) || 1,
                        isStudentsInvolved: isStudentsInvolved,
                        authors: authors,
                        
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
                        status: 'Approved',
                        entryType: 'Admin'
                    };

                    // 5. Save to DB
                    const query = {
                        $or: [
                            { isbn: textbookData.isbn },
                            { title: textbookData.title }
                        ]
                    };

                    const existingTextbook = await Textbook.findOne(query);
                    if (existingTextbook) {
                        console.log(`Skipping row ${i + 1}: Already exists (Duplicate title or ISBN)`);
                    } else {
                        await Textbook.create(textbookData);
                        console.log(`Created new Textbook entry for ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}: ${err.message || err}`);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
