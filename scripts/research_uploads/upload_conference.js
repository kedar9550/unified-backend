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

    const headers = [
        'empId', 'facultyName', 'academicYear', 'college', 'title', 'doi',
        'conferenceName', 'level', 'yearOfPublication', 'month', 'issnIsbn',
        'publisher', 'indexing', 'totalAuthors', 'facultyAuthorPosition',
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
                                const axios = require('axios');
                                const response = await axios.get(`https://info.aec.edu.in/adityaapi/api/staffdata/${coAuthorEmpId}`);
                                if (response.data && response.data.length > 0 && response.data[0].employeename) {
                                    empName = response.data[0].employeename;
                                    affiliation = response.data[0].college || 'Aditya University';
                                }
                            } catch (apiErr) {
                                console.log(`API lookup failed for ${coAuthorEmpId}`);
                            }

                            coAuthors.push({
                                name: empName,
                                affiliation: affiliation,
                                employeeId: coAuthorEmpId
                            });
                        }
                    }

                    // 4. Prepare Conference Object
                    const conferenceData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || '',
                        title: row['title'] || 'Unknown Title',
                        doi: row['doi'] || 'N/A',
                        conferenceName: row['conferenceName'] || 'Unknown Conference',
                        scope: row['level'] || 'National',
                        year: row['yearOfPublication'] || yearStr.split('-')[0],
                        month: row['month'] || 'JAN',
                        issnIsbn: row['issnIsbn'] || '',
                        publisher: row['publisher'] || '',
                        indexing: row['indexing'] || '',
                        totalAuthors: Number(row['totalAuthors']) || 1,
                        userAuthorPosition: Number(row['facultyAuthorPosition']) || 1,
                        coAuthors: coAuthors,
                        
                        // Default fields
                        applyIncentive: 'No',
                        applyingSeedGrant: 'No',
                        certificate: 'placeholder.pdf',
                        proceedings: 'placeholder.pdf',
                        status: 'Approved'
                    };

                    // 5. Save to DB
                    const existingConference = await Conference.findOne({ title: conferenceData.title, facultyId: faculty._id });
                    if (existingConference && conferenceData.title !== 'Unknown Title') {
                        console.log(`Conference '${conferenceData.title}' already exists for this faculty, updating...`);
                        await Conference.updateOne({ _id: existingConference._id }, { $set: conferenceData });
                    } else {
                        await Conference.create(conferenceData);
                        console.log(`Created new Conference entry for ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}:`, err);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
