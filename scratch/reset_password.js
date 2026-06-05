const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const mongoURI = "mongodb://kedarnadha_db_user:5uyAKg1rRFhH1f20@ac-pogja6y-shard-00-00.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-01.kcpzev0.mongodb.net:27017,ac-pogja6y-shard-00-02.kcpzev0.mongodb.net:27017/UnifiedDb?ssl=true&replicaSet=atlas-vyaq5g-shard-0&authSource=admin&appName=Cluster0";

async function run() {
    try {
        await mongoose.connect(mongoURI);
        console.log("Connected to MongoDB");

        const newPassword = "Aditya@123";
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const result = await mongoose.connection.db.collection('employees').updateOne(
            { institutionId: "5741" },
            { $set: { password: hashedPassword } }
        );

        console.log("Password reset result:", result);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
