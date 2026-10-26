const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Patent = require('../../modules/Patent/Patent.model');
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

function parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;
    
    // Check DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10) - 1;
        const year = parseInt(dmyMatch[3], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date;
    }

    // Check YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10) - 1;
        const day = parseInt(ymdMatch[3], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date;
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
}

async function processCSV() {
    const results = [];
    const csvFilePath = path.join(__dirname, 'patents.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    // Validate Template
    const fileContent = fs.readFileSync(csvFilePath, 'utf8').toLowerCase();
    if (!fileContent.includes('application number') && !fileContent.includes('patent title') && !fileContent.includes('patent name')) {
        console.log('Parsed 0 rows');
        console.log('Error processing row 0: Invalid Template Format! Please upload the correct CSV template for Patents.');
        process.exit(0);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'college', 'panNumber', 'title',
        'applicationNo', 'patentStatus', 'facultyRole', 'applicantName', 'area',
        'dateOfFiling', 'publishedDate', 'grantedDate', 'patentFiledCountry',
        'patentFiledInInstitution', 'isUtilityType', 'eligibleForTechTransfer',
        'isStudentsInvolved', 'month', 'year',
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

                    // 3. Process Co-inventors
                    const coInventors = [];
                    for (let pos = 1; pos <= 8; pos++) {
                        const coInventorEmpId = row[`co${pos}`] ? row[`co${pos}`].trim() : null;
                        if (coInventorEmpId) {
                            let empName = `Employee ${coInventorEmpId}`;
                            let affiliation = 'Aditya University';
                            
                            try {
                                const { fetchStaffFromEcap } = require('../../utils/ecapService');
                                const staffData = await fetchStaffFromEcap(coInventorEmpId);
                                if (staffData && (staffData.employeename || staffData.EmployeeName)) {
                                    empName = staffData.employeename || staffData.EmployeeName;
                                    affiliation = staffData.college || 'Aditya University';
                                }
                            } catch (apiErr) {
                                console.log(`API lookup failed for ${coInventorEmpId}`);
                            }

                            coInventors.push({
                                name: empName,
                                affiliation: affiliation,
                                employeeId: coInventorEmpId,
                                CoInventorType: 'faculty'
                            });
                        }
                    }

                    // 4. Determine status and parse dates
                    const rawStatus = (row['patentStatus'] || '').trim().toLowerCase();
                    const isGranted = rawStatus === 'granted';
                    const patentStatus = isGranted ? 'Granted' : 'Published';

                    const parsedFilingDate = parseDate(row['dateOfFiling']) || new Date();
                    const parsedPubDate = parseDate(row['publishedDate']) || parsedFilingDate;
                    const parsedGrantDate = isGranted ? (parseDate(row['grantedDate']) || parsedPubDate) : null;

                    const rawRole = (row['facultyRole'] || '').trim().toLowerCase();
                    const facultyRole = rawRole.includes('inventor') ? 'Inventor / Co-Inventor' : 'Applicant';

                    const hasOtherAusInventors = coInventors.length > 0;
                    const defaultClaimant = hasOtherAusInventors ? null : faculty.institutionId;

                    const publishedSubDoc = {
                        academicYear: academicYear._id,
                        publishedstatus: 'yes',
                        publisheddate: parsedPubDate,
                        applyIncentive: 'No',
                        applyingSeedGrant: 'No',
                        status: 'Approved',
                        appraisalEligible: 'Yes',
                        appraisalClaimant: defaultClaimant
                    };

                    const grantedSubDoc = {
                        academicYear: isGranted ? academicYear._id : undefined,
                        grantedstatus: isGranted ? 'yes' : 'no',
                        granteddate: parsedGrantDate || undefined,
                        applyIncentive: 'No',
                        applyingSeedGrant: 'No',
                        status: isGranted ? 'Approved' : undefined,
                        appraisalEligible: isGranted ? 'Yes' : null,
                        appraisalClaimant: isGranted ? defaultClaimant : null
                    };

                    const patentData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || faculty.college || '',
                        panNumber: row['panNumber'] || '',
                        title: (row['title'] || `Patent ${row['applicationNo'] || 'Unknown'}`).trim(),
                        facultyRole: facultyRole,
                        applicantName: (row['applicantName'] || 'Aditya University').trim(),
                        applicantAffiliation: 'Aditya University',
                        patentName: (row['applicantName'] || 'Aditya University').trim(),
                        area: (row['area'] || 'General Engineering').trim(),
                        applicationNo: (row['applicationNo'] || `APP-${Date.now()}-${i}`).trim(),
                        dateOfFiling: parsedFilingDate,
                        patentFiledCountry: (row['patentFiledCountry'] || 'India').trim(),
                        patentFiledInInstitution: (row['patentFiledInInstitution'] && row['patentFiledInInstitution'].trim().toLowerCase() === 'no') ? 'No' : 'Yes',
                        isUtilityType: (row['isUtilityType'] && row['isUtilityType'].trim().toLowerCase() === 'no') ? 'No' : 'Yes',
                        isInstitutionRecord: 'No',
                        patentStatus: patentStatus,
                        eligibleForTechTransfer: (row['eligibleForTechTransfer'] && row['eligibleForTechTransfer'].trim().toLowerCase() === 'yes') ? 'Yes' : 'No',
                        isStudentsInvolved: (row['isStudentsInvolved'] && row['isStudentsInvolved'].trim().toLowerCase() === 'yes') ? 'Yes' : 'No',
                        month: (row['month'] || 'JAN').trim().toUpperCase(),
                        year: (row['year'] || yearStr.split('-')[0]).trim(),
                        applyIncentive: 'No',
                        applyingSeedGrant: 'No',
                        entryType: 'Admin',
                        status: 'Approved',
                        appraisalEligible: 'Yes',
                        appraisalClaimant: defaultClaimant,
                        incentiveClaimant: null,
                        statusUpdatedToGranted: isGranted,
                        statusUpdatedDate: isGranted ? parsedGrantDate : null,
                        coInventors: coInventors,
                        published: publishedSubDoc,
                        granted: grantedSubDoc,
                        cbr: 'placeholder.pdf',
                        form1: 'placeholder.pdf',
                        grantedCertificate: isGranted ? 'placeholder.pdf' : undefined
                    };

                    // 5. Save to DB
                    const query = {
                        $or: [
                            { applicationNo: patentData.applicationNo },
                            { title: patentData.title }
                        ]
                    };

                    const existingPatent = await Patent.findOne(query);
                    if (existingPatent) {
                        console.log(`Skipping row ${i + 1}: Already exists (Duplicate Application No or Title)`);
                    } else {
                        await Patent.create(patentData);
                        console.log(`Created new Patent entry for ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}: ${err.message || err}`);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
