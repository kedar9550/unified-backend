const mongoose = require('mongoose');
const dotenv = require('dotenv');
const JournalImpactFactor = require('../modules/JournalImpactFactor/JournalImpactFactor.model');

dotenv.config();

const jifData = [
  { rank: 1, journalName: "CA-A CANCER JOURNAL FOR CLINICIANS", abbreviatedJournal: "CA-CANCER J CLIN", publisher: "WILEY", jif: 232.4 },
  { rank: 2, journalName: "NATURE REVIEWS MICROBIOLOGY", abbreviatedJournal: "NAT REV MICROBIOL", publisher: "NATURE PORTFOLIO", jif: 103.3 },
  { rank: 3, journalName: "NATURE REVIEWS DRUG DISCOVERY", abbreviatedJournal: "NAT REV DRUG DISCOV", publisher: "NATURE PORTFOLIO", jif: 101.8 },
  { rank: 4, journalName: "NATURE REVIEWS MOLECULAR CELL BIOLOGY", abbreviatedJournal: "NAT REV MOL CELL BIO", publisher: "NATURE PORTFOLIO", jif: 90.2 },
  { rank: 5, journalName: "Kidney International Supplements", abbreviatedJournal: "KIDNEY INT SUPPL", publisher: "ELSEVIER SCIENCE INC", jif: 89.6 },
  { rank: 6, journalName: "LANCET", abbreviatedJournal: "LANCET", publisher: "ELSEVIER SCIENCE INC", jif: 88.5 },
  { rank: 7, journalName: "Nature Reviews Materials", abbreviatedJournal: "NAT REV MATER", publisher: "NATURE PORTFOLIO", jif: 86.2 },
  { rank: 8, journalName: "Nature Reviews Clinical Oncology", abbreviatedJournal: "NAT REV CLIN ONCOL", publisher: "NATURE PORTFOLIO", jif: 82.2 },
  { rank: 9, journalName: "NEW ENGLAND JOURNAL OF MEDICINE", abbreviatedJournal: "NEW ENGL J MED", publisher: "MASSACHUSETTS MEDICAL SOC", jif: 78.5 },
  { rank: 10, journalName: "Nature Reviews Earth & Environment", abbreviatedJournal: "NAT REV EARTH ENV", publisher: "SPRINGERNATURE", jif: 71.5 }
];

const seedJif = async () => {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log('MongoDB Connected for seeding JIF...');

        // Clear existing
        await JournalImpactFactor.deleteMany({});
        console.log('Existing JIF entries cleared.');

        // Insert new
        await JournalImpactFactor.insertMany(jifData);
        console.log(`${jifData.length} JIF entries seeded successfully!`);

        process.exit(0);
    } catch (error) {
        console.error('Error seeding JIF entries:', error);
        process.exit(1);
    }
};

seedJif();
