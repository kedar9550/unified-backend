const ContributionCategory = require('./ContributionCategory.model');

const INITIAL_CATEGORIES = [
  { code: 1, name: "Member of BOG/GB/AC/BOS (Outside AUS only)" },
  { code: 2, name: "Member of the Editorial Board of a journal (SCIE, Q1, Q2)" },
  { code: 3, name: "Member of the Editorial Board of a journal (ESCI, Q3, Q4, Conference proceedings)" },
  { code: 4, name: "Awards (By MHRD/AICTE/UGC/State govt./Top 2%)" },
  { code: 5, name: "Awards (By NGOs/Trusts/others)" },
  { code: 6, name: "Developed e-content (Complete course uploaded into website)" },
  { code: 7, name: "Certification on new age technologies (min. 40 hours)" },
  { code: 8, name: "Trained Students shortlisted for the finals of a Hackathon/startup/Events" },
  { code: 9, name: "Articles published in Magazines/Newspapers" },
  { code: 10, name: "Establishment/Maintenance of a research facility" },
  { code: 11, name: "NPTEL Course completion (12W/8W/4W)" },
  { code: 12, name: "Coursera Course completion (min. 40 hours)" },
  { code: 13, name: "FDP / Seminar Grant Sanctioned" }
];

exports.getCategories = async (req, res) => {
    try {
        let categories = await ContributionCategory.find().sort({ code: 1 });
        
        // Auto-seed if empty
        if (categories.length === 0) {
            await ContributionCategory.insertMany(INITIAL_CATEGORIES);
            categories = await ContributionCategory.find().sort({ code: 1 });
        } else {
            // Auto-update names if they don't match exactly
            let updated = false;
            for (let cat of categories) {
                const targetName = INITIAL_CATEGORIES.find(c => c.code === cat.code)?.name;
                if (targetName && cat.name !== targetName) {
                    await ContributionCategory.updateOne({ _id: cat._id }, { name: targetName });
                    updated = true;
                }
            }
            if (updated) {
                categories = await ContributionCategory.find().sort({ code: 1 });
            }
        }
        
        res.status(200).json({ success: true, data: categories });
    } catch (error) {
        console.error("Error fetching contribution categories:", error);
        res.status(500).json({ success: false, message: "Failed to fetch contribution categories" });
    }
};
