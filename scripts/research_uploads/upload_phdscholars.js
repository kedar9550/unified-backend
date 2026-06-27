const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const PhdApplication = require('../../modules/PhdScholar/PhdApplication.model');
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
    const csvFilePath = path.join(__dirname, 'phdscholars.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'rollNumber', 'studentName', 'course',
        'branch', 'scholarStatus', 'scholarType', 'university', 'date'
    ];

    fs.createReadStream(csvFilePath)
        .pipe(csv({ skipLines: 1, headers: headers })) // skipLines: 1 as no sub-headers
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

                    // Parse Date (assuming DD-MM-YYYY or similar)
                    let admissionDate = new Date();
                    if (row['date']) {
                        const parts = row['date'].split('-');
                        if (parts.length === 3) {
                            // Convert DD-MM-YYYY to YYYY-MM-DD
                            admissionDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                        } else {
                            admissionDate = new Date(row['date']);
                        }
                    }

                    // 3. Prepare PhdApplication Object
                    const applicationData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        rollNumber: row['rollNumber'] || `UNKNOWN-${Date.now()}`,
                        studentName: row['studentName'] || 'Unknown Student',
                        course: row['course'] || 'Ph.D',
                        branch: row['branch'] || '',
                        scholarStatus: row['scholarStatus'] || 'Pursuing',
                        scholarType: row['scholarType'] || 'Full-Time',
                        university: row['university'] || 'Unknown University',
                        admissionOrAwardDate: isNaN(admissionDate) ? new Date() : admissionDate,
                        
                        // Default fields
                        document: 'placeholder.pdf',
                        status: 'Approved'
                    };

                    // 4. Save to DB
                    const existingApp = await PhdApplication.findOne({ rollNumber: applicationData.rollNumber, facultyId: faculty._id });
                    if (existingApp && !applicationData.rollNumber.startsWith('UNKNOWN')) {
                        console.log(`Ph.D Application with roll number '${applicationData.rollNumber}' already exists, updating...`);
                        await PhdApplication.updateOne({ _id: existingApp._id }, { $set: applicationData });
                    } else {
                        await PhdApplication.create(applicationData);
                        console.log(`Created new Ph.D Application entry for ${applicationData.studentName} under ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}:`, err);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
