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
    const fileContent = fs.readFileSync(csvFilePath, 'utf8');
    const lowerContent = fileContent.toLowerCase();
    if (!lowerContent.includes('application number') && !lowerContent.includes('patent title') && !lowerContent.includes('patent name')) {
        console.log('Parsed 0 rows');
        console.log('Error processing row 0: Invalid Template Format! Please upload the correct CSV template for Patents.');
        process.exit(0);
    }

    const firstLine = fileContent.split(/\r?\n/)[0] || '';
    const headerCols = firstLine.split(',').map(c => c.replace(/^["']|["']$/g, '').trim().toLowerCase());
    let coIndex = 1;
    const headers = headerCols.map((col, idx) => {
        if (col.includes('employee id') || col === 'empid') return 'empId';
        if (col.includes('faculty name')) return 'facultyName';
        if (col.includes('academic year')) return 'academicYear';
        if (col === 'college') return 'college';
        if (col.includes('pan number')) return 'panNumber';
        if (col.includes('patent title') || col === 'title') return 'title';
        if (col.includes('application number') || col.includes('application no')) return 'applicationNo';
        if (col.includes('patent status')) return 'patentStatus';
        if (col.includes('faculty role')) return 'facultyRole';
        if (col.includes('patent applicant name')) return 'patentApplicantName';
        if (col.includes('patent applicant affiliation') || col.includes('patent applicant affliation')) return 'patentApplicantAffliation';
        if (col.includes('applicant name')) return 'applicantName';
        if (col.includes('area')) return 'area';
        if (col.includes('date of filing') || col.includes('filing date')) return 'dateOfFiling';
        if (col.includes('published date')) return 'publishedDate';
        if (col.includes('granted date')) return 'grantedDate';
        if (col.includes('patent filed country') || col.includes('country')) return 'patentFiledCountry';
        if (col.includes('filed in institution') || col.includes('institution name')) return 'patentFiledInInstitution';
        if (col.includes('utility type')) return 'isUtilityType';
        if (col.includes('tech transfer')) return 'eligibleForTechTransfer';
        if (col.includes('students involved')) return 'isStudentsInvolved';
        if (col === 'month') return 'month';
        if (col === 'year') return 'year';
        if (col.includes('seed grant')) return 'applyingSeedGrant';
        if (col.includes('published apply incentive')) return 'publishedApplyIncentive';
        if (col.includes('published expected')) return 'publishedExpectedAmount';
        if (col.includes('published approved')) return 'publishedApprovedAmount';
        if (col.includes('published appraisal')) return 'publishedAppraisalEligible';
        if (col.includes('granted apply incentive')) return 'grantedApplyIncentive';
        if (col.includes('granted expected')) return 'grantedExpectedAmount';
        if (col.includes('granted approved')) return 'grantedApprovedAmount';
        if (col.includes('granted appraisal')) return 'grantedAppraisalEligible';
        if (col.includes('co-inventor') || col.includes('coinventor') || idx >= headerCols.length - 8) {
            return `co${coIndex++}`;
        }
        return `col_${idx}`;
    });

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

                    const rawSeedGrant = (row['applyingSeedGrant'] || '').trim().toLowerCase();
                    const applyingSeedGrant = rawSeedGrant === 'yes' ? 'Yes' : 'No';

                    const isUtilityType = (row['isUtilityType'] && row['isUtilityType'].trim().toLowerCase() === 'no') ? 'No' : 'Yes';

                    // 5. Published Stage Fields
                    let publishedExpectedAmount = undefined;
                    if (row['publishedExpectedAmount'] !== undefined && row['publishedExpectedAmount'] !== null && String(row['publishedExpectedAmount']).trim() !== '') {
                        const parsed = Number(row['publishedExpectedAmount']);
                        if (!isNaN(parsed)) {
                            publishedExpectedAmount = parsed;
                        }
                    }

                    let publishedApprovedAmount = undefined;
                    if (row['publishedApprovedAmount'] !== undefined && row['publishedApprovedAmount'] !== null && String(row['publishedApprovedAmount']).trim() !== '') {
                        const parsed = Number(row['publishedApprovedAmount']);
                        if (!isNaN(parsed)) {
                            publishedApprovedAmount = parsed;
                        }
                    }

                    const rawPubIncentive = (row['publishedApplyIncentive'] || '').trim().toLowerCase();
                    let publishedApplyIncentive = 'No';
                    if (rawPubIncentive === 'yes' || (publishedApprovedAmount !== undefined && publishedApprovedAmount > 0) || (publishedExpectedAmount !== undefined && publishedExpectedAmount > 0)) {
                        publishedApplyIncentive = 'Yes';
                    }

                    if (publishedApplyIncentive === 'Yes' && publishedExpectedAmount === undefined) {
                        let base = 5000;
                        if (applyingSeedGrant === 'Yes') base = base / 2;
                        if (isUtilityType === 'No') base = 0;
                        publishedExpectedAmount = base;
                    }

                    const rawPubAppraisal = (row['publishedAppraisalEligible'] || '').trim().toLowerCase();
                    const publishedAppraisalEligible = rawPubAppraisal === 'no' ? 'No' : 'Yes';

                    // 6. Granted Stage Fields
                    let grantedExpectedAmount = undefined;
                    if (row['grantedExpectedAmount'] !== undefined && row['grantedExpectedAmount'] !== null && String(row['grantedExpectedAmount']).trim() !== '') {
                        const parsed = Number(row['grantedExpectedAmount']);
                        if (!isNaN(parsed)) {
                            grantedExpectedAmount = parsed;
                        }
                    }

                    let grantedApprovedAmount = undefined;
                    if (row['grantedApprovedAmount'] !== undefined && row['grantedApprovedAmount'] !== null && String(row['grantedApprovedAmount']).trim() !== '') {
                        const parsed = Number(row['grantedApprovedAmount']);
                        if (!isNaN(parsed)) {
                            grantedApprovedAmount = parsed;
                        }
                    }

                    const rawGrantedIncentive = (row['grantedApplyIncentive'] || '').trim().toLowerCase();
                    let grantedApplyIncentive = 'No';
                    if (isGranted) {
                        if (rawGrantedIncentive === 'yes' || (grantedApprovedAmount !== undefined && grantedApprovedAmount > 0) || (grantedExpectedAmount !== undefined && grantedExpectedAmount > 0)) {
                            grantedApplyIncentive = 'Yes';
                        }

                        if (grantedApplyIncentive === 'Yes' && grantedExpectedAmount === undefined) {
                            let base = 15000;
                            if (applyingSeedGrant === 'Yes') base = base / 2;
                            if (isUtilityType === 'No') base = 0;
                            grantedExpectedAmount = base;
                        }
                    }

                    const rawGrantedAppraisal = (row['grantedAppraisalEligible'] || '').trim().toLowerCase();
                    const grantedAppraisalEligible = isGranted ? (rawGrantedAppraisal === 'no' ? 'No' : 'Yes') : null;

                    // 7. Claimant Calculations (matching Journal & Conference logic)
                    // If other AUS authors/co-inventors exist, appraisalClaimant is null.
                    // If only one AUS author (applicant itself), appraisalClaimant is applicant itself.
                    const hasOtherAusAuthors = coInventors.length > 0;

                    const publishedAppraisalClaimant = (publishedAppraisalEligible === 'No' || hasOtherAusAuthors) ? null : faculty.institutionId;

                    const grantedAppraisalClaimant = isGranted
                        ? ((grantedAppraisalEligible === 'No' || hasOtherAusAuthors) ? null : faculty.institutionId)
                        : null;

                    // Root Document Claims & Eligibility
                    const rootApplyIncentive = (publishedApplyIncentive === 'Yes' || (isGranted && grantedApplyIncentive === 'Yes')) ? 'Yes' : 'No';
                    const rootIncentiveClaimant = rootApplyIncentive === 'Yes' ? faculty.institutionId : null;

                    const rootAppraisalEligible = isGranted ? grantedAppraisalEligible : publishedAppraisalEligible;
                    const rootAppraisalClaimant = isGranted ? grantedAppraisalClaimant : publishedAppraisalClaimant;

                    let rootApprovedAmount = undefined;
                    if (isGranted && grantedApprovedAmount !== undefined) {
                        rootApprovedAmount = grantedApprovedAmount;
                    } else if (publishedApprovedAmount !== undefined) {
                        rootApprovedAmount = publishedApprovedAmount;
                    }

                    const publishedSubDoc = {
                        academicYear: academicYear._id,
                        publishedstatus: 'yes',
                        publisheddate: parsedPubDate,
                        publishedexpectedamount: publishedExpectedAmount,
                        publishedincentiveamount: publishedApprovedAmount,
                        publishedinsentiveappllieddate: publishedApplyIncentive === 'Yes' ? (parsedPubDate || new Date()) : undefined,
                        applyIncentive: publishedApplyIncentive,
                        applyingSeedGrant: applyingSeedGrant,
                        status: 'Approved',
                        appraisalEligible: publishedAppraisalEligible,
                        appraisalClaimant: publishedAppraisalClaimant
                    };

                    const grantedSubDoc = {
                        academicYear: isGranted ? academicYear._id : undefined,
                        grantedstatus: isGranted ? 'yes' : 'no',
                        granteddate: parsedGrantDate || undefined,
                        grantedexpectedamount: isGranted ? grantedExpectedAmount : undefined,
                        grantedincentiveamount: isGranted ? grantedApprovedAmount : undefined,
                        grantedinsentiveappllieddate: (isGranted && grantedApplyIncentive === 'Yes') ? (parsedGrantDate || new Date()) : undefined,
                        applyIncentive: isGranted ? grantedApplyIncentive : 'No',
                        applyingSeedGrant: isGranted ? applyingSeedGrant : 'No',
                        status: isGranted ? 'Approved' : undefined,
                        appraisalEligible: grantedAppraisalEligible,
                        appraisalClaimant: grantedAppraisalClaimant
                    };

                    const patentData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || faculty.college || '',
                        panNumber: row['panNumber'] || '',
                        title: (row['title'] || `Patent ${row['applicationNo'] || 'Unknown'}`).trim(),
                        facultyRole: facultyRole,
                        applicantName: faculty.name || (row['applicantName'] || '').trim(),
                        patentApplicantAffliation: (row['patentApplicantAffliation'] || (row['patentFiledInInstitution'] && row['patentFiledInInstitution'].trim().toLowerCase() === 'no' ? (facultyRole === 'Applicant' ? (faculty.college || 'Aditya University') : '') : 'Aditya University') || faculty.college || 'Aditya University').trim(),
                        patentApplicantName: (row['patentApplicantName'] || (row['patentFiledInInstitution'] && row['patentFiledInInstitution'].trim().toLowerCase() === 'no' ? (facultyRole === 'Applicant' ? faculty.name : '') : 'Aditya University') || 'Aditya University').trim(),
                        area: (row['area'] || 'General Engineering').trim(),
                        applicationNo: (row['applicationNo'] || `APP-${Date.now()}-${i}`).trim(),
                        dateOfFiling: parsedFilingDate,
                        patentFiledCountry: (row['patentFiledCountry'] || 'India').trim(),
                        patentFiledInInstitution: (row['patentFiledInInstitution'] && row['patentFiledInInstitution'].trim().toLowerCase() === 'no') ? 'No' : 'Yes',
                        isUtilityType: isUtilityType,
                        isInstitutionRecord: 'No',
                        patentStatus: patentStatus,
                        eligibleForTechTransfer: (row['eligibleForTechTransfer'] && row['eligibleForTechTransfer'].trim().toLowerCase() === 'yes') ? 'Yes' : 'No',
                        isStudentsInvolved: (row['isStudentsInvolved'] && row['isStudentsInvolved'].trim().toLowerCase() === 'yes') ? 'Yes' : 'No',
                        month: (row['month'] || 'JAN').trim().toUpperCase(),
                        year: (row['year'] || yearStr.split('-')[0]).trim(),
                        applyIncentive: rootApplyIncentive,
                        applyingSeedGrant: applyingSeedGrant,
                        approvedAmount: rootApprovedAmount,
                        entryType: 'Admin',
                        status: 'Approved',
                        appraisalEligible: rootAppraisalEligible,
                        appraisalClaimant: rootAppraisalClaimant,
                        incentiveClaimant: rootIncentiveClaimant,
                        statusUpdatedToGranted: isGranted,
                        statusUpdatedDate: isGranted ? parsedGrantDate : null,
                        coInventors: coInventors,
                        published: publishedSubDoc,
                        granted: grantedSubDoc,
                        cbr: 'placeholder.pdf',
                        form1: 'placeholder.pdf',
                        grantedCertificate: isGranted ? 'placeholder.pdf' : undefined
                    };

                    // 8. Save to DB
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
