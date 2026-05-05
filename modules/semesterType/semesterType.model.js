const mongoose = require('mongoose');

const SemesterTypeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
        // Values: 'ODD', 'EVEN', 'SUMMER', 'YEAR'
        // YEAR = used for Pharma.D (no semester concept, year-based)
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('SemesterType', SemesterTypeSchema);

/*
  SEED DATA (run once):
  ['ODD', 'EVEN', 'SUMMER', 'YEAR']
  
  - ODD    → B.Tech/M.Tech odd semesters (1,3,5,7)
  - EVEN   → B.Tech/M.Tech even semesters (2,4,6,8)
  - SUMMER → Summer semester (25S format)
  - YEAR   → Pharma.D year-based (I Year, II Year...)
*/
