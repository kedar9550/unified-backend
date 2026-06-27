const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NovelProduct = require('../../modules/NovelProduct/NovelProduct.model');
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
    const csvFilePath = path.join(__dirname, 'novelproducts.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file not found at ${csvFilePath}`);
        process.exit(1);
    }

    const headers = [
        'empId', 'facultyName', 'academicYear', 'category', 'productName', 'organizationName', 'piType',
        'co1EmpId', 'co1Role', 'co2EmpId', 'co2Role', 'co3EmpId', 'co3Role', 'co4EmpId', 'co4Role',
        'co5EmpId', 'co5Role', 'co6EmpId', 'co6Role', 'co7EmpId', 'co7Role', 'co8EmpId', 'co8Role'
    ];

    fs.createReadStream(csvFilePath)
        .pipe(csv({ skipLines: 3, headers: headers }))
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

                    // 3. PI/Co-PI Logic
                    const piTypeInput = row['piType'] ? row['piType'].trim().toLowerCase() : '';
                    let principalInvestigator = 'No';
                    let coPrincipalInvestigator = 'No';
                    let investigatorType = 'Principal Investigator (PI)';

                    if (piTypeInput.includes('co-principal investigator') || piTypeInput.includes('co-pi')) {
                        coPrincipalInvestigator = 'Yes';
                        investigatorType = 'Co-Principal Investigator (Co-PI)';
                    } else if (piTypeInput.includes('principal investigator') || piTypeInput.includes('pi')) {
                        principalInvestigator = 'Yes';
                        investigatorType = 'Principal Investigator (PI)';
                    } else {
                        // Default to PI
                        principalInvestigator = 'Yes';
                    }

                    // 4. Process Co-Developers
                    const coDevelopers = [];
                    for (let pos = 1; pos <= 8; pos++) {
                        const coEmpId = row[`co${pos}EmpId`] ? row[`co${pos}EmpId`].trim() : null;
                        const coRoleInput = row[`co${pos}Role`] ? row[`co${pos}Role`].trim().toLowerCase() : '';
                        
                        if (coEmpId) {
                            let empName = `Employee ${coEmpId}`;
                            let affiliation = 'Aditya University';
                            
                            try {
                                const response = await axios.get(`https://info.aec.edu.in/adityaapi/api/staffdata/${coEmpId}`);
                                if (response.data && response.data.length > 0 && response.data[0].employeename) {
                                    empName = response.data[0].employeename;
                                    affiliation = response.data[0].college || 'Aditya University';
                                }
                            } catch (apiErr) {
                                console.log(`API lookup failed for ${coEmpId}`);
                            }

                            let role = 'Co-Investigator';
                            let isPI = 'No';
                            let isCoPI = 'Yes';

                            if (coRoleInput === 'pi' || coRoleInput === 'principal investigator') {
                                role = 'Principal Investigator';
                                isPI = 'Yes';
                                isCoPI = 'No';
                            } else if (coRoleInput === 'co-pi' || coRoleInput === 'co-principal investigator') {
                                role = 'Co-Principal Investigator';
                                isPI = 'No';
                                isCoPI = 'Yes';
                            }

                            coDevelopers.push({
                                role: role,
                                affiliationType: 'AUS',
                                employeeId: coEmpId,
                                name: empName,
                                affiliation: affiliation,
                                principalInvestigator: isPI,
                                coPrincipalInvestigator: isCoPI
                            });
                        }
                    }

                    const category = row['category'] ? row['category'].trim() : 'Developed';
                    const productName = row['productName'] ? row['productName'].trim() : 'Untitled Product';
                    const organizationName = row['organizationName'] ? row['organizationName'].trim() : '';

                    let developedOrganization = '';
                    let implementedOrganization = '';

                    if (category.toLowerCase() === 'implemented') {
                        implementedOrganization = organizationName;
                    } else {
                        // Default to Developed
                        developedOrganization = organizationName;
                    }

                    const productData = {
                        facultyId: faculty._id,
                        academicYear: academicYear._id,
                        productName: productName,
                        description: 'No description provided', // Default placeholder
                        category: category.toLowerCase() === 'implemented' ? 'Implemented' : 'Developed',
                        developedOrganization: developedOrganization,
                        implementedOrganization: implementedOrganization,
                        investigatorType: investigatorType,
                        principalInvestigator: principalInvestigator,
                        coPrincipalInvestigator: coPrincipalInvestigator,
                        coDevelopers: coDevelopers,
                        document: 'placeholder.pdf', // Required by schema
                        status: 'Approved',
                        applyIncentive: 'No'
                    };

                    await NovelProduct.create(productData);
                    console.log(`Created new NovelProduct entry for ${faculty.name}`);

                } catch (err) {
                    console.error(`Error processing row ${i + 1}:`, err);
                }
            }
            
            console.log('Finished processing CSV');
            mongoose.connection.close();
        });
}
