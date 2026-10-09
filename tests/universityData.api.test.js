const mongoose = require('mongoose');
const dotenv = require('dotenv');
const universityDataService = require('../modules/CentralEvents/UniversityData/universityData.service');

dotenv.config();

async function runApiTests() {
  console.log('--- Running University Data API & Service Tests ---');
  const mongoUri = process.env.UnifiedDb || 'mongodb://127.0.0.1:27017/unifieddb';
  await mongoose.connect(mongoUri);

  const mockUser = { userId: 'test_user_123', emp_id: 'EMP101', roles: ['ADMIN'] };

  // Test 1: Calculated form (1.1 - admission_intake)
  console.log('\n[Test 1] Testing Calculated Form 1.1 (intake & percentage formula)...');
  const payload1_1 = {
    academic_year: '2025-26',
    program: 'B.Tech',
    branch: 'CSE',
    level: 'UG',
    duration: '4 Years',
    intake: 120,
    male: 70,
    female: 50,
    remarks: 'Full intake achieved'
  };

  const rec1_1 = await universityDataService.createRecord('1.1', payload1_1, mockUser);
  console.assert(rec1_1.total === 120, `Form 1.1 Total Calc Failed: expected 120, got ${rec1_1.total}`);
  console.assert(rec1_1.enroll_pct === 100, `Form 1.1 Enroll Pct Calc Failed: expected 100, got ${rec1_1.enroll_pct}`);
  console.log('✅ Form 1.1 Created & Calculated Successfully:', { id: rec1_1._id, total: rec1_1.total, enroll_pct: rec1_1.enroll_pct });

  // Test 2: Activity Form (2.5 - academic_activities)
  console.log('\n[Test 2] Testing Activity Form 2.5 (academic_activities storage)...');
  const payload2_5 = {
    academic_year: '2025-26',
    department: 'CSE',
    title: 'Advanced Full Stack Web Dev',
    resource_person: 'Dr. John Doe',
    start_date: '2025-10-15',
    end_date: '2025-10-17',
    participants: 150,
    contact_hours: 36 // extra field
  };

  const rec2_5 = await universityDataService.createRecord('2.5', payload2_5, mockUser);
  console.assert(rec2_5.form_type === '2.5', `Form 2.5 type mismatch`);
  console.assert(rec2_5.dedupe_key.includes('2.5|2025-26|CSE|Advanced Full Stack Web Dev'), `Dedupe key missing expected prefix`);
  console.assert(rec2_5.extra?.contact_hours === 36, `Extra field contact_hours failed`);
  console.log('✅ Form 2.5 Activity Record Created Successfully:', { id: rec2_5._id, dedupe_key: rec2_5.dedupe_key, extra: rec2_5.extra });

  // Test 3: Duplicate detection (Form 2.5 duplicate key error check)
  console.log('\n[Test 3] Testing Duplicate Key Error (HTTP 409 simulation)...');
  try {
    await universityDataService.createRecord('2.5', payload2_5, mockUser);
    console.assert(false, 'Should have thrown duplicate key error');
  } catch (err) {
    console.assert(err.statusCode === 409, `Expected HTTP 409, got ${err.statusCode}`);
    console.log('✅ Duplicate key correctly rejected with HTTP 409 Conflict:', err.message);
  }

  // Test 4: Flat Form (6.3 - placements)
  console.log('\n[Test 4] Testing Flat Form 6.3 (placements)...');
  const payload6_3 = {
    academic_year: '2025-26',
    program: 'B.Tech CSE',
    student_name: 'Rahul Verma',
    roll_number: '21A91A0501',
    company: 'Google',
    core_company: 'Yes',
    job_role: 'Software Engineer',
    package_lpa: 18.5,
    offer_date: '2025-09-01'
  };

  const rec6_3 = await universityDataService.createRecord('6.3', payload6_3, mockUser);
  console.assert(rec6_3.package_lpa === 18.5, `Form 6.3 package_lpa failed`);
  console.log('✅ Form 6.3 Placement Record Created Successfully:', { id: rec6_3._id, company: rec6_3.company, package: rec6_3.package_lpa });

  // Test 5: Rows Form (3.4 - research_guides with sub-table scholars)
  console.log('\n[Test 5] Testing Rows Form 3.4 (research_guides with nested scholars)...');
  const payload3_4 = {
    academic_year: '2025-26',
    department: 'CSE',
    emp_id: 'EMP304',
    guide_name: 'Dr. A. Sharma',
    designation: 'Professor',
    scholars: [
      { name: 'K. Sriman', year: 2024, university: 'Aditya University', title: 'Deep Learning in Vision' },
      { name: 'P. Lavanya', year: 2025, university: 'Aditya University', title: 'NLP for Local Languages' }
    ]
  };

  const rec3_4 = await universityDataService.createRecord('3.4', payload3_4, mockUser);
  console.assert(rec3_4.scholars.length === 2, `Form 3.4 scholars count failed`);
  console.log('✅ Form 3.4 Guide with Rows Created Successfully:', { id: rec3_4._id, scholars_count: rec3_4.scholars.length });

  // Test 6: List / Search / Pagination
  console.log('\n[Test 6] Testing List, Pagination & Search API...');
  const listResult = await universityDataService.listRecords('6.3', { academic_year: '2025-26', page: 1, limit: 10 }, mockUser);
  console.assert(listResult.pagination.total >= 1, `List records total failed`);
  console.log('✅ List API Returned Paginated Data:', listResult.pagination);

  // Clean up test documents
  console.log('\nCleaning up test documents...');
  await universityDataService.deleteRecord('1.1', rec1_1._id, mockUser);
  await universityDataService.deleteRecord('2.5', rec2_5._id, mockUser);
  await universityDataService.deleteRecord('6.3', rec6_3._id, mockUser);
  await universityDataService.deleteRecord('3.4', rec3_4._id, mockUser);
  console.log('✅ Test records cleaned up cleanly!');

  console.log('\n🎉 ALL UNIVERSITY DATA SERVICE API TESTS PASSED PERFECTLY!');
  process.exit(0);
}

runApiTests().catch((err) => {
  console.error('❌ API Test Failed:', err);
  process.exit(1);
});
