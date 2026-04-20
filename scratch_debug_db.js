const mongoose = require("mongoose");
const path = require("path");
// Adjust dotenv path based on where we are. We are in a scratch directory, backend is at d:\Ganesha\Varahi amma\Unified-Portal\backend
require("dotenv").config({ path: "d:\\Ganesha\\Varahi amma\\Unified-Portal\\backend\\.env" });

const ProcterMaping = require("d:\\Ganesha\\Varahi amma\\Unified-Portal\\backend\\modules\\ProcterMaping\\ProcterMaping.model.js");
const StudentResult = require("d:\\Ganesha\\Varahi amma\\Unified-Portal\\backend\\modules\\StudentResult\\StudentResult.model.js");

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(async () => {
    console.log("Connected to MongoDB.");

    const mappings = await ProcterMaping.find().limit(5).lean();
    console.log("--- Sample ProcterMappings ---");
    console.log(JSON.stringify(mappings, null, 2));

    const results = await StudentResult.find().limit(5).lean();
    console.log("--- Sample StudentResults ---");
    console.log(JSON.stringify(results, null, 2));

    mongoose.disconnect();
})
.catch(err => {
    console.error("DB connection error:", err);
});
