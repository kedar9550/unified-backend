const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const Appraisal = require('../modules/Appraisal/Appraisal.model');
const ResourceUtilization = require('../modules/ResourceUtilization/ResourceUtilization.model');
const Contribution = require('../modules/Contribution/Contribution.model');
const FacultyAdministration = require('../modules/FacultyAdministration/FacultyAdministration.model');
const Employee = require('../modules/Employee/employee.model');

mongoose.connect(process.env.UnifiedDb || "mongodb://127.0.0.1:27017/unified", {


}).then(async () => {
    console.log("Connected to MongoDB. Starting Verification...\n");
    
    // Find ALL appraisals (irrespective of status as requested by user)
    const appraisals = await Appraisal.find({});
    
    let mismatchCount = 0;

    for (let app of appraisals) {
        let hasMismatch = false;
        let reasons = [];

        // 1. Check Resource Utilization
        const resourceUt = await ResourceUtilization.find({ 
            facultyId: app.facultyId, 
            academicYear: app.academicYearId, 
            status: { $ne: "Rejected" }, 
            removedFromAppraisal: { $ne: true } 
        });
        
        const dbResCount = app.valueAddition?.resourceUtilization?.items?.length || 0;
        if (resourceUt.length !== dbResCount) {
            hasMismatch = true;
            reasons.push(`Resource Utilization: Expected (UI) has ${resourceUt.length}, Actual DB has ${dbResCount}`);
        }

        // 2. Check Contributions
        const contributions = await Contribution.find({ 
            facultyId: app.facultyId, 
            academicYear: app.academicYearId, 
            status: { $ne: "Rejected" }, 
            removedFromAppraisal: { $ne: true } 
        });
        
        const dbContCount = app.valueAddition?.expertiseContribution?.items?.length || 0;
        if (contributions.length !== dbContCount) {
            hasMismatch = true;
            reasons.push(`Contributions: Expected (UI) has ${contributions.length}, Actual DB has ${dbContCount}`);
        }

        // 3. Check Administration
        const adminDetail = await FacultyAdministration.findOne({ 
            facultyId: app.facultyId, 
            academicYear: app.academicYearId 
        });
        
        const activeAdminRoles = adminDetail?.roles?.filter(r => r.isResponsible && r.status !== 'Rejected') || [];
        const dbAdminCount = app.administration?.items?.length || 0;
        
        if (activeAdminRoles.length !== dbAdminCount) {
            hasMismatch = true;
            reasons.push(`Administration: Expected (UI) has ${activeAdminRoles.length}, Actual DB has ${dbAdminCount}`);
        }

        if (hasMismatch) {
            mismatchCount++;
            const emp = await Employee.findById(app.facultyId).select('name institutionId');
            console.log(`Mismatch Found for Faculty: ${emp?.name || 'Unknown'} (${emp?.institutionId || 'N/A'}) - Appraisal Status: ${app.status}`);
            reasons.forEach(r => console.log(`  - ${r}`));
            console.log("---------------------------------------------------");
        }
    }
    
    console.log(`\nVerification Complete. Total Mismatched Profiles: ${mismatchCount} out of ${appraisals.length}`);
    process.exit(0);
}).catch(err => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
});
