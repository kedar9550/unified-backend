const mongoose = require('mongoose');
require('dotenv').config();

const AcademicYear = require('../modules/academicYear/academicYear.model');

// Try finding UnifiedDb
const MONGO_URI = process.env.UnifiedDb || process.env.MONGO_URI || process.env.DATABASE; 

const migrate = async () => {
    if (!MONGO_URI) {
        console.error('UnifiedDb is not defined in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const years = await AcademicYear.find();
        
        console.log(`Found ${years.length} AcademicYear documents.`);

        const today = new Date();

        for (const doc of years) {
            console.log(`Processing year: ${doc.year}`);
            
            // doc.year is "YYYY-YYYY"
            const parts = doc.year.split('-');
            if (parts.length === 2) {
                const startYear = parseInt(parts[0], 10);
                const endYear = parseInt(parts[1], 10);
                
                const startDate = new Date(startYear, 5, 26); // June 26
                const endDate = new Date(endYear, 5, 25, 23, 59, 59, 999); // June 25 next year
                
                let active = false;
                if (startDate <= today && endDate >= today) {
                    active = true;
                }
                
                // Use raw update to ensure we can unset 'programs' and 'isGlobalActive'
                await AcademicYear.collection.updateOne(
                    { _id: doc._id },
                    {
                        $set: {
                            startDate: startDate,
                            endDate: endDate,
                            active: active
                        },
                        $unset: {
                            programs: "",
                            isGlobalActive: ""
                        }
                    }
                );
                console.log(`Updated ${doc.year} - active: ${active}`);
            }
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();
