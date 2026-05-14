const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Publisher = require('../modules/Publisher/Publisher.model');

dotenv.config();

const publishersData = [
  { name: "Allen & Unwin Book Publishers", type: "International" },
  { name: "Anderson Press", type: "International" },
  { name: "Apress", type: "International" },
  { name: "Artech House", type: "International" },
  { name: "Bertelsmann", type: "International" },
  { name: "Between The Lines", type: "International" },
  { name: "Bloomsbury Publishing", type: "International" },
  { name: "Bonnier", type: "International" },
  { name: "Boulder Books", type: "International" },
  { name: "Brown Walker Press", type: "International" },
  { name: "California University press", type: "International" },
  { name: "Cambridge University Press", type: "International" },
  { name: "Cengage", type: "International" },
  { name: "Central West Publishing", type: "International" },
  { name: "China Publishing Group Corporate", type: "International" },
  { name: "CRC Press", type: "International" },
  { name: "CSIRO Publishing", type: "International" },
  { name: "De Agostini Editore", type: "International" },
  { name: "Douglas & McIntyre", type: "International" },
  { name: "Elsevier", type: "International" },
  { name: "Emerald Group Publishing", type: "International" },
  { name: "Fordham University Press", type: "International" },
  { name: "Grupo Planeta", type: "International" },
  { name: "Grupo Santillana", type: "International" },
  { name: "Hachette Livre", type: "International" },
  { name: "Harlequin", type: "International" },
  { name: "HarperCollins", type: "International" },
  { name: "Harriman House", type: "International" },
  { name: "Holtzbrinck", type: "International" },
  { name: "Houghton Mifflin Harcourt", type: "International" },
  { name: "Informa", type: "International" },
  { name: "Kadokawa Publishing", type: "International" },
  { name: "Kodansha", type: "International" },
  { name: "LexisNexis Group", type: "International" },
  { name: "Macmillan International Higher Education", type: "International" },
  { name: "Macmillan Publishers", type: "International" },
  { name: "Manning Publications", type: "International" },
  { name: "McGraw Hill Education", type: "International" },
  { name: "Packt Publishing", type: "International" },
  { name: "MIT Press", type: "International" },
  { name: "O'Reilly Media", type: "International" },
  { name: "World Scientific Publishing", type: "International" },
  { name: "Mondadori", type: "International" },
  { name: "Nelson Education", type: "International" },
  { name: "Nova Science Publishers", type: "International" },
  { name: "Oxford University Press", type: "International" },
  { name: "Palgrave Macmillan", type: "International" },
  { name: "Pearson", type: "International" },
  { name: "Penguin Random House", type: "International" },
  { name: "Perseus", type: "International" },
  { name: "Phoenix Publishing and Media Company", type: "International" },
  { name: "Princeton University Press", type: "International" },
  { name: "Purdue University Press", type: "International" },
  { name: "Readers Digest", type: "International" },
  { name: "RELX Group", type: "International" },
  { name: "SAGE Publishing", type: "International" },
  { name: "Scholastic", type: "International" },
  { name: "Science Publishers", type: "International" },
  { name: "Shogakukan", type: "International" },
  { name: "Shueisha", type: "International" },
  { name: "Simon & Schuster", type: "International" },
  { name: "Springer", type: "International" },
  { name: "Thomson Reuters", type: "International" },
  { name: "University of Toronto Press", type: "International" },
  { name: "University of Westminster Press", type: "International" },
  { name: "Wiley", type: "International" },
  { name: "Wilfrid Laurier University Press", type: "International" },
  { name: "Wolters Kluwer", type: "International" },

  { name: "Agro-Bios(India)", type: "National" },
  { name: "Agrotech Pub.Academy", type: "National" },
  { name: "Wiley-Blackwell", type: "National" },
  { name: "BSP Books", type: "National" },
  { name: "Cambridge University Press India", type: "National" },
  { name: "CBS Publishers & Distributors", type: "National" },
  { name: "Charotar Publishing House", type: "National" },
  { name: "Dhanpat Rai Publications", type: "National" },
  { name: "Himalaya Publishing House", type: "National" },
  { name: "Khanna Publishers", type: "National" },
  { name: "Laxmi Publications", type: "National" },
  { name: "McGraw Hill Education (India) Pvt. Ltd (Tata McGraw-Hill)", type: "National" },
  { name: "Narosa Publishing House", type: "National" },
  { name: "New Age International Publishers", type: "National" },
  { name: "Orient Longman", type: "National" },
  { name: "Oxford University Press India", type: "National" },
  { name: "PHI Learning Pvt. Ltd", type: "National" },
  { name: "Prism Books", type: "National" },
  { name: "Routledge, India", type: "National" },
  { name: "S. Chand Publishing", type: "National" },
  { name: "S.K. Kataria & Sons", type: "National" },
  { name: "Standard Publishers Distributor", type: "National" },
  { name: "Sterling Publications", type: "National" },
  { name: "Universities Press (India) Pvt. Ltd", type: "National" },
  { name: "Vikas Publishing House", type: "National" },
];

const seedPublishers = async () => {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log('MongoDB Connected for seeding...');

        // Clear existing
        await Publisher.deleteMany({});
        console.log('Existing publishers cleared.');

        // Insert new
        await Publisher.insertMany(publishersData);
        console.log(`${publishersData.length} publishers seeded successfully!`);

        process.exit(0);
    } catch (error) {
        console.error('Error seeding publishers:', error);
        process.exit(1);
    }
};

seedPublishers();
