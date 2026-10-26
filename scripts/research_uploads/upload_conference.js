const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Conference = require('../../modules/Conference/Conference.model');
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
    const csvFilePath = path.join(__dirname, 'conferences.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    // Validate Template
    const fileContent = fs.readFileSync(csvFilePath, 'utf8').toLowerCase();
    if (!fileContent.includes('conference name')) {
        console.log('Parsed 0 rows');
        console.log('Error processing row 0: Invalid Template Format! Please upload the correct CSV template for Conferences.');
        process.exit(0);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'college', 'title', 'doi',
        'conferenceName', 'location', 'presentationMode', 'conferenceType',
        'year', 'month', 'issnIsbn', 'publisher', 'scopusIndexed',
        'totalAuthors', 'facultyAuthorPosition', 'isStudentsInvolved', 'sdgs',
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
                                authorPosition: pos,
                                CoAuthorType: 'faculty'
                            });
                        }
                    }

                    // 4. Prepare Conference Object
                    const rawLocation = (row['location'] || '').trim().toLowerCase();
                    const location = rawLocation.includes('abroad') ? 'Abroad' : 'India';

                    const rawMode = (row['presentationMode'] || '').trim().toLowerCase();
                    const presentationMode = rawMode === 'online' ? 'Online' : 'Offline';

                    const rawCType = (row['conferenceType'] || '').trim();
                    const validTypes = ['IEEE', 'IITs/IISc/NITs/IIMs', 'IIT', 'IISc', 'NIT', 'IIM', 'Other'];
                    let conferenceType = validTypes.find(t => t.toLowerCase() === rawCType.toLowerCase());
                    if (!conferenceType) {
                        if (/ieee/i.test(rawCType)) conferenceType = 'IEEE';
                        else if (/iit|iisc|nit|iim/i.test(rawCType)) conferenceType = 'IITs/IISc/NITs/IIMs';
                        else conferenceType = 'Other';
                    }

                    const rawScopus = (row['scopusIndexed'] || '').trim().toLowerCase();
                    const scopusIndexed = rawScopus === 'no' ? 'No' : 'Yes';

                    const rawStudents = (row['isStudentsInvolved'] || '').trim().toLowerCase();
                    const isStudentsInvolved = rawStudents === 'yes' ? 'Yes' : 'No';

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

                    let rawDoi = (row['doi'] || '').trim();
                    if (!rawDoi || rawDoi.toLowerCase() === 'n/a' || rawDoi.toLowerCase() === 'no doi') {
                        rawDoi = null;
                    }

                    const conferenceData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || faculty.college || '',
                        panNumber: row['panNumber'] || '',
                        title: (row['title'] || 'Unknown Title').trim(),
                        doi: rawDoi,
                        conferenceName: (row['conferenceName'] || 'Unknown Conference').trim(),
                        location: location,
                        presentationMode: presentationMode,
                        conferenceType: conferenceType,
                        year: (row['year'] || yearStr.split('-')[0]).trim(),
                        month: (row['month'] || 'JAN').trim().toUpperCase(),
                        issnIsbn: (row['issnIsbn'] || '').trim(),
                        publisher: (row['publisher'] || '').trim(),
                        scopusIndexed: scopusIndexed,
                        totalAuthors: Number(row['totalAuthors']) || 1,
                        userAuthorPosition: Number(row['facultyAuthorPosition']) || 1,
                        isStudentsInvolved: isStudentsInvolved,
                        sdgs: row['sdgs'] ? row['sdgs'].trim() : null,
                        applyingSeedGrant: applyingSeedGrant,
                        applyIncentive: applyIncentive,
                        estimatedIncentiveAmount: estimatedIncentiveAmount,
                        approvedAmount: approvedAmount,
                        appraisalEligible: appraisalEligible,
                        appraisalClaimant: appraisalClaimant,
                        incentiveClaimant: incentiveClaimant,
                        coAuthors: coAuthors,
                        
                        // Default fields
                        scopusSubtype: 'cp',
                        firstPage: 'placeholder.pdf',
                        certificate: 'placeholder.pdf',
                        completeDocument: 'placeholder.pdf',
                        status: 'Approved',
                        entryType: 'Admin'
                    };

                    // 5. Save to DB
                    const query = {
                        $or: [
                            { title: conferenceData.title }
                        ]
                    };
                    if (conferenceData.doi) {
                        query.$or.push({ doi: conferenceData.doi });
                    }

                    const existingConference = await Conference.findOne(query);
                    if (existingConference) {
                        console.log(`Skipping row ${i + 1}: Already exists (Duplicate title or DOI)`);
                    } else {
                        await Conference.create(conferenceData);
                        console.log(`Created new Conference entry for ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}: ${err.message || err}`);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
