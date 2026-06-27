const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Journal = require('../../modules/Journal/Journal.model');
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
    const csvFilePath = path.join(__dirname, 'journals.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'college', 'panNumber', 'doi',
        'publicationScope', 'journalQuartile', 'journalType', 'paperTitle', 'journalName',
        'volume', 'issue', 'publishedMonth', 'publishedYear', 'hIndex', 'jcrImpactFactor',
        'totalAuthors', 'facultyAuthorPosition', 'co1', 'co2', 'co3', 'co4', 'co5', 'co6', 'co7', 'co8'
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
                    // Positions 1 to 8 based on template
                    for (let pos = 1; pos <= 8; pos++) {
                        const coAuthorEmpId = row[`co${pos}`] ? row[`co${pos}`].trim() : null;
                        if (coAuthorEmpId) {
                            let empName = `Employee ${coAuthorEmpId}`;
                            let affiliation = 'Aditya';
                            
                            try {
                                const axios = require('axios');
                                const response = await axios.get(`https://info.aec.edu.in/adityaapi/api/staffdata/${coAuthorEmpId}`);
                                if (response.data && response.data.length > 0 && response.data[0].employeename) {
                                    empName = response.data[0].employeename;
                                    affiliation = response.data[0].college || 'Aditya';
                                }
                            } catch (apiErr) {
                                console.log(`API lookup failed for ${coAuthorEmpId}`);
                            }

                            coAuthors.push({
                                name: empName,
                                affiliation: affiliation,
                                employeeId: coAuthorEmpId,
                                authorPosition: pos
                            });
                        }
                    }

                    // 4. Prepare Journal Object
                    const journalData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        college: row['college'] || '',
                        panNumber: row['panNumber'] || '',
                        doi: row['doi'] || 'N/A',
                        publicationScope: row['publicationScope'] || 'National/International',
                        journalQuartile: row['journalQuartile'] || 'Q1',
                        journalType: row['journalType'] || '',
                        paperTitle: row['paperTitle'] || 'Unknown Title',
                        journalName: row['journalName'] || 'Unknown Journal',
                        vol: row['volume'] || '',
                        issue: row['issue'] || '',
                        publishedMonth: row['publishedMonth'] || 'JAN',
                        publishedYear: row['publishedYear'] || yearStr.split('-')[0],
                        hIndex: row['hIndex'] || '',
                        jcrImpactFactor: row['jcrImpactFactor'] || '',
                        totalAuthors: Number(row['totalAuthors']) || 1,
                        userAuthorPosition: Number(row['facultyAuthorPosition']) || 1,
                        coAuthors: coAuthors,
                        
                        // Default fields required by DB but not in this specific CSV template
                        applyingSeedGrant: 'No',
                        applyIncentive: 'No',
                        publishedPaper: 'placeholder.pdf',
                        referencePages: 'placeholder.pdf',
                        status: 'Approved'
                    };

                    // 5. Save to DB
                    // Check if exists to avoid duplicates (optional, checking by DOI or just inserting)
                    const existingJournal = await Journal.findOne({ doi: journalData.doi, facultyId: faculty._id });
                    if (existingJournal && journalData.doi !== 'N/A') {
                        console.log(`Journal with DOI ${journalData.doi} already exists for this faculty, updating...`);
                        await Journal.updateOne({ _id: existingJournal._id }, { $set: journalData });
                    } else {
                        await Journal.create(journalData);
                        console.log(`Created new Journal entry for ${faculty.name}`);
                    }

                } catch (err) {
                    console.error(`Error processing row ${i + 1}:`, err);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
