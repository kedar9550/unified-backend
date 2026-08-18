require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
mongoose.connect(process.env.UnifiedDb)
  .then(async () => {
    const Appraisal = require('./modules/Appraisal/Appraisal.model');
    const c4 = await Appraisal.countDocuments({ status: /Pro Vice-Chancellor/i });
    console.log('Appraisals for PVC:', c4);
    
    // Group appraisals by status to see what exists
    const statusCounts = await Appraisal.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    console.log('Status counts:', statusCounts);
    
    process.exit(0);
  });
