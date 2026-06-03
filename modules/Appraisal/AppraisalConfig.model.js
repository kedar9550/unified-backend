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
        resourceUtilizationPoints: {
            conference: { type: Number, default: 10 },
            sttp: { type: Number, default: 10 },
            fdp: { type: Number, default: 10 },
            guestLecture: { type: Number, default: 2 },
            resourcePerson: { type: Number, default: 2 },
            participated: { type: Number, default: 1 }
        },
        expertisePoints: {
            memberBOS: { type: Number, default: 5 },
            editorialBoardSCIE: { type: Number, default: 5 },
            editorialBoardESCI: { type: Number, default: 3 },
            awardsGovt: { type: Number, default: 5 },
            awardsOthers: { type: Number, default: 3 },
            developedEContent: { type: Number, default: 10 },
            certificationNewAge: { type: Number, default: 5 },
            hackathonShortlisted: { type: Number, default: 5 },
            newspaperArticle: { type: Number, default: 3 },
            researchFacility: { type: Number, default: 3 },
            nptel12W: { type: Number, default: 10 },
            nptel8W: { type: Number, default: 8 },
            nptel4W: { type: Number, default: 5 },
            coursera: { type: Number, default: 5 },
            grantSanctioned: { type: Number, default: 5 }
        },
        expertiseMaxPoints: { type: Number, default: 10 }
    },
    administration: {
        maxPoints: { type: Number, default: 20 },
        rolePoints: {
            deanCentral: { type: Number, default: 20 },
            hodCentral: { type: Number, default: 15 },
            hodDept: { type: Number, default: 15 },
            dyHodDept: { type: Number, default: 10 },
            timetableDept: { type: Number, default: 10 },
            placementCentral: { type: Number, default: 10 },
            placementDept: { type: Number, default: 10 },
            courseraCentral: { type: Number, default: 10 },
            courseraDept: { type: Number, default: 5 },
            edcCentral: { type: Number, default: 10 },
            edcDept: { type: Number, default: 5 },
            courseDept: { type: Number, default: 5 },
            websiteCentral: { type: Number, default: 10 },
            nssCentral: { type: Number, default: 10 },
            nssDept: { type: Number, default: 5 },
            trainingCentral: { type: Number, default: 10 },
            trainingDept: { type: Number, default: 5 },
            drcDept: { type: Number, default: 5 },
            antiRaggingCentral: { type: Number, default: 5 },
            antiRaggingDept: { type: Number, default: 3 },
            otherCentral: { type: Number, default: 10 },
            otherDept: { type: Number, default: 5 }
        }
    },
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee"
    }
}, { timestamps: true });

module.exports = mongoose.model("AppraisalConfig", AppraisalConfigSchema);
