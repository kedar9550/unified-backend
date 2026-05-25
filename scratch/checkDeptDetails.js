const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const run = async () => {
    await mongoose.connect(process.env.UnifiedDb);
    console.log("Connected to DB");

    const dept = await mongoose.connection.db.collection('departments').findOne({ _id: new mongoose.Types.ObjectId("69e8886140cfffab5e05f66a") });
    console.log(`Department for 69e8886140cfffab5e05f66a: ${JSON.stringify(dept)}`);

    const applicant = await mongoose.connection.db.collection('employees').findOne({ name: /KEDAR/i });
    console.log(`Applicant details: ${JSON.stringify(applicant)}`);

    mongoose.disconnect();
};

run().catch(console.error);
