const mongoose = require("mongoose");

const PointRangeSchema = new mongoose.Schema({
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    points: { type: Number, required: true }
}, { _id: false });

const AppraisalConfigSchema = new mongoose.Schema({
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true,
        unique: true
    },
    teaching: {
        passPercentagePoints: [PointRangeSchema],
        feedbackPoints: [PointRangeSchema],
        proctoringPoints: [PointRangeSchema],
        coAttainmentPoints: {
            5: { type: Number, default: 20 },
            4: { type: Number, default: 15 },
            3: { type: Number, default: 10 },
            2: { type: Number, default: 5 }
        }
    },
    research: {
        journalPoints: {
            "IEEE/ASME/ASCE/ACM/FT-50/Scopus Top 10%": { type: Number, default: 25 },
            "SCIE/Scopus (Q1/Q2)": { type: Number, default: 20 },
            "SCIE/Scopus (Q1/Q2) - Co-Author": { type: Number, default: 15 },
            "Scopus (Q3/Q4)/ESCI": { type: Number, default: 10 }
        },
        phdGuidingPoints: {
            pursuing: { type: Number, default: 2 },
            awarded: { type: Number, default: 20 }
        },
        bookConferencePoints: {
            isbnBook: { type: Number, default: 10 },
            isbnBookChapter: { type: Number, default: 5 },
            scopusConference: { type: Number, default: 5 },
            maxPoints: { type: Number, default: 10 }
        },
        patentPoints: {
            published: { type: Number, default: 5 },
            granted: { type: Number, default: 20 }
        },
        novelProductPoints: {
            developed: { type: Number, default: 10 },
            implemented: { type: Number, default: 20 }
        },
        projectProposalPoints: {
            shortlisted: { type: Number, default: 5 },
            sanctionedPerLakh: { type: Number, default: 5 }
        },
        citationRate: { type: Number, default: 0.2 } // 0.2 points/citation
    },
    valueAddition: {
        resourceUtilization: {
            organized: { type: Number, default: 10 },
            guestLectureCoordinator: { type: Number, default: 2 },
            resourcePerson: { type: Number, default: 2 },
            participated: { type: Number, default: 1 }
        },
        expertiseMaxPoints: { type: Number, default: 10 }
    },
    administration: {
        maxPoints: { type: Number, default: 20 }
    },
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee"
    }
}, { timestamps: true });

module.exports = mongoose.model("AppraisalConfig", AppraisalConfigSchema);
