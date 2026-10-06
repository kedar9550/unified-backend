const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const CentralEventType = require('../modules/CentralEvents/EventTypes/CentralEventType.model');
const CentralEventCategory = require('../modules/CentralEvents/EventCategories/CentralEventCategory.model');
const Organizer = require('../modules/CentralEvents/Events/Organizer.model');

const mongoUri = process.env.UnifiedDb || 'mongodb://localhost:27017/digital_services';

async function seedData() {
  try {
    console.log('Connecting to Mongo DB:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully.');

    // 1. Seed Event Types
    const typesData = [
      { code: 'VEDA', name: 'VEDA National Tech Fest', hasCategories: true, hasLevels: false, allowedLevels: [], sortOrder: 1 },
      { code: 'COLORS', name: 'COLORS Youth Cultural Fest', hasCategories: true, hasLevels: false, allowedLevels: [], sortOrder: 2 },
      { code: 'ALA', name: 'ALA Literary & Arts Festival', hasCategories: true, hasLevels: false, allowedLevels: [], sortOrder: 3 },
      { code: 'CLUB', name: 'Club Events & Activities', hasCategories: true, hasLevels: false, allowedLevels: [], sortOrder: 4 },
      { code: 'DEPARTMENTAL', name: 'Departmental Programs', hasCategories: false, hasLevels: true, allowedLevels: ['STUDENT', 'FACULTY'], sortOrder: 5 },
      { code: 'UNIVERSITY', name: 'University Central Programs', hasCategories: false, hasLevels: true, allowedLevels: ['STUDENT', 'FACULTY'], sortOrder: 6 }
    ];

    for (const t of typesData) {
      await CentralEventType.findOneAndUpdate({ code: t.code }, t, { upsert: true, new: true, runValidators: true });
    }
    console.log('Central Event Types seeded.');

    // 2. Fetch created types map
    const types = await CentralEventType.find();
    const typeMap = {};
    types.forEach(t => { typeMap[t.code] = t; });

    // 3. Seed Categories
    const categoriesData = [
      // VEDA
      { typeCode: 'VEDA', code: 'TECH_PAPERS', name: 'Technical Paper Presentations', sortOrder: 1 },
      { typeCode: 'VEDA', code: 'ROBOTICS', name: 'Robotics & Automation', sortOrder: 2 },
      { typeCode: 'VEDA', code: 'HACKATHONS', name: 'Coding & Hackathons', sortOrder: 3 },
      { typeCode: 'VEDA', code: 'DESIGN_EXPO', name: 'Design & Prototype Expo', sortOrder: 4 },
      // COLORS
      { typeCode: 'COLORS', code: 'DANCE', name: 'Dance Showcase & Battles', sortOrder: 1 },
      { typeCode: 'COLORS', code: 'MUSIC', name: 'Vocal & Instrumental Music', sortOrder: 2 },
      { typeCode: 'COLORS', code: 'THEATRE', name: 'Drama & Skits', sortOrder: 3 },
      { typeCode: 'COLORS', code: 'FINE_ARTS', name: 'Painting & Craft', sortOrder: 4 },
      // ALA
      { typeCode: 'ALA', code: 'DEBATE', name: 'Debates & Elocution', sortOrder: 1 },
      { typeCode: 'ALA', code: 'POETRY', name: 'Poetry Slam & Recitation', sortOrder: 2 },
      { typeCode: 'ALA', code: 'WRITING', name: 'Creative Writing & Journalism', sortOrder: 3 },
      // CLUB
      { typeCode: 'CLUB', code: 'INNOVATION', name: 'Innovation & Entrepreneurship', sortOrder: 1 },
      { typeCode: 'CLUB', code: 'COMMUNITY', name: 'Community & Social Service', sortOrder: 2 },
      { typeCode: 'CLUB', code: 'SPORTS', name: 'Esports & Gaming', sortOrder: 3 }
    ];

    for (const cat of categoriesData) {
      const typeObj = typeMap[cat.typeCode];
      if (typeObj) {
        await CentralEventCategory.findOneAndUpdate(
          { typeId: typeObj._id, code: cat.code },
          { ...cat, typeId: typeObj._id },
          { upsert: true, new: true, runValidators: true }
        );
      }
    }
    console.log('Central Event Categories seeded.');

    // 4. Seed Organizers
    const organizersData = [
      // Scope DEPARTMENT
      { scope: 'DEPARTMENT', code: 'CSE', name: 'Computer Science & Engineering' },
      { scope: 'DEPARTMENT', code: 'ECE', name: 'Electronics & Communication Engineering' },
      { scope: 'DEPARTMENT', code: 'EEE', name: 'Electrical & Electronics Engineering' },
      { scope: 'DEPARTMENT', code: 'MECH', name: 'Mechanical Engineering' },
      { scope: 'DEPARTMENT', code: 'CIVIL', name: 'Civil Engineering' },
      { scope: 'DEPARTMENT', code: 'IT', name: 'Information Technology' },
      // Scope UNIVERSITY
      { scope: 'UNIVERSITY', code: 'IQAC', name: 'Internal Quality Assurance Cell' },
      { scope: 'UNIVERSITY', code: 'RND', name: 'Research & Development Cell' },
      { scope: 'UNIVERSITY', code: 'SAC', name: 'Student Activity Center' },
      { scope: 'UNIVERSITY', code: 'PLACEMENT', name: 'Training & Placement Cell' }
    ];

    for (const org of organizersData) {
      await Organizer.findOneAndUpdate(
        { scope: org.scope, code: org.code },
        org,
        { upsert: true, new: true, runValidators: true }
      );
    }
    console.log('Organizers seeded.');

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding data:', err);
    process.exit(1);
  }
}

seedData();
