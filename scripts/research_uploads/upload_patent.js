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

async function processCSV() {
    const results = [];
    const csvFilePath = path.join(__dirname, 'patents.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'college', 'applicantName', 'area',
        'filingNo', 'dateOfFiling', 'patentFiledCountry', 'patentStatus', 'year', 'month',
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
                                const axios = require('axios');
                                const response = await axios.get(`https://info.aec.edu.in/adityaapi/api/staffdata/${coInventorEmpId}`);
                                if (response.data && response.data.length > 0 && response.data[0].employeename) {
                                    empName = response.data[0].employeename;
                                    affiliation = response.data[0].college || 'Aditya University';
                                }
                            } catch (apiErr) {
                                console.log(`API lookup failed for ${coInventorEmpId}`);
                            }

                            coInventors.push({
                                name: empName,
                                affiliation: affiliation,
                                employeeId: coInventorEmpId
                            });
                        }
                    }
                    
                    // Parse Date Of Filing (assuming DD-MM-YYYY or similar)
                    let dof = new Date();
                    if (row['dateOfFiling']) {
                        const parts = row['dateOfFiling'].split('-');
                        if (parts.length === 3) {
                            // Convert DD-MM-YYYY to YYYY-MM-DD
                            dof = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                        } else {
                            dof = new Date(row['dateOfFiling']);
                        }
                    }

                    // 4. Prepare Patent Object
                    const patentData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || '',
                        title: `Patent ${row['filingNo'] || 'Unknown'}`,
                        applicantName: row['applicantName'] || 'Unknown Applicant',
                        patentName: `Patent ${row['filingNo'] || 'Unknown'}`,
                        area: row['area'] || 'Unknown Area',
                        filingNo: row['filingNo'] || 'N/A',
                        dateOfFiling: isNaN(dof) ? new Date() : dof,
                        patentFiledCountry: row['patentFiledCountry'] || 'India',
                        patentStatus: row['patentStatus'] || 'Filed',
                        month: row['month'] || 'JAN',
                        year: row['year'] || yearStr.split('-')[0],
                        coInventors: coInventors,
                        
                        // Default fields
                        applyIncentive: 'No',
                        applyingSeedGrant: 'No',
                        eFilingReceipt: 'placeholder.pdf',
                        form1: 'placeholder.pdf',
                        status: 'Approved'
                    };

                    // 5. Save to DB
                    const existingPatent = await Patent.findOne({ filingNo: patentData.filingNo, facultyId: faculty._id });
                    if (existingPatent && patentData.filingNo !== 'N/A') {
                        console.log(`Patent with filing number '${patentData.filingNo}' already exists for this faculty, updating...`);
                        await Patent.updateOne({ _id: existingPatent._id }, { $set: patentData });
                    } else {
                        await Patent.create(patentData);
                        console.log(`Created new Patent entry for ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}:`, err);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
