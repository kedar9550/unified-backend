const mongoose = require('mongoose');
require('dotenv').config({ path: 'd:/W/Unified/unified-backend/.env' });

const Employee = require('./modules/employee/employee.model');
const Journal = require('./modules/Journal/Journal.model');
const AcademicYear = require('./modules/academicYear/academicYear.model');

async function checkData() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/unified');
  
  const journals = await Journal.find({}).populate('facultyId', 'name').populate('academicYear', 'year').lean();
  console.log(`Total Journals in DB: ${journals.length}`);
  
  if (journals.length > 0) {
    console.log("Sample Journal:", JSON.stringify({
      title: journals[0].paperTitle,
      facultyId: journals[0].facultyId?._id,
      facultyName: journals[0].facultyId?.name,
      academicYear: journals[0].academicYear?.year,
      academicYearId: journals[0].academicYear?._id
    }, null, 2));
  }

  const ays = await AcademicYear.find({}).lean();
  console.log("\nAcademic Years in DB:");
  ays.forEach(ay => console.log(`- ${ay.year} (ID: ${ay._id}, Active: ${ay.isGlobalActive})`));

  process.exit(0);
}

checkData();
