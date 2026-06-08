const mongoose = require("mongoose");

const AppraisalSchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true
    },
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true
    },
    status: {
        type: String,
        enum: [
            "Draft", 
            "Submitted to HOD", 
            "Pending Research Admin", 
            "Completed", 
            "Rejected by HOD"
        ],
        default: "Draft"
    },
    
    // PART-A: Personal Information
    personalInfoSnapshot: {
        name: String,
        institutionId: String,
        departmentName: String,
        designation: String,
        scopusId: String,
        wosId: String,
        orcidId: String,
        dateOfJoining: Date,
        qualification: String
    },

    // PART-B: Performance Attributes & Points
    // 1. Teaching (Max 80 points)
    teaching: {
        passPercentage: {
            courses: [{
                courseName: String,
                secBranchSem: String,
                appeared: Number,
                passed: Number,
                percentage: Number,
                pointsClaimed: Number
            }],
            averagePoints: { type: Number, default: 0 }
        },
        feedback: {
            courses: [{
                courseName: String,
                secBranchSem: String,
                noOfStudents: Number,
                feedbackPercentage: Number,
                pointsClaimed: Number
            }],
            averagePoints: { type: Number, default: 0 }
        },
        proctoring: {
            entries: [{
                programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program" },
                programCode: String,
                branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
                branchCode: String,
                semesterNumber: Number,
                yearNumber: Number,
                section: Number,
                totalStudents: Number,
                appeared: Number,
                passed: Number,
                percentage: Number,
                pointsClaimed: Number
            }],
            averagePoints: { type: Number, default: 0 },
            hasProctoringDuties: { type: String, enum: ["Yes", "No", null], default: null }
        },
        coAttainment: {
            courses: [{
                courseName: String,
                secBranchSem: String,
                noOfCos: Number,
                noOfCosAttained: Number,
                pointsClaimed: Number
            }],
            averagePoints: { type: Number, default: 0 }
        },
        totalClaimed: { type: Number, default: 0 } // sum of average points, capped at 80
    },

    // 2. Research Contributions
    research: {
        papers: {
            items: [{
                paperId: { type: mongoose.Schema.Types.ObjectId, refPath: 'research.papers.items.paperType' },
                paperType: { type: String, enum: ['Journal', 'Conference'] },
                title: String,
                scope: String,
                doi: String,
                claimStatus: String,
                claimedBy: String,
                isMultiAUSAuthor: Boolean,
                pointsClaimed: Number,
                impactFactor: Number
            }],
            totalClaimed: { type: Number, default: 0 }
        },
        phdGuiding: {
            items: [{
                scholarId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhdApplication' },
                name: String,
                status: String, // Pursuing / Awarded
                scholarType: String,
                university: String,
                admissionOrAwardDate: Date,
                pointsClaimed: Number
            }],
            totalClaimed: { type: Number, default: 0 }
        },
        booksChapters: {
            items: [{
                itemId: { type: mongoose.Schema.Types.ObjectId, refPath: 'research.booksChapters.items.itemType' },
                itemType: { type: String, enum: ['Textbook', 'BookChapter', 'Conference'] },
                title: String,
                isbn: String,
                pointsClaimed: Number
            }],
            totalClaimed: { type: Number, default: 0 } // Capped at max 10 points
        },
        patents: {
            items: [{
                patentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patent' },
                title: String,
                status: String, // Published / Granted
                filingNo: String,
                dateOfFiling: Date,
                country: { type: String, default: 'India' },
                pointsClaimed: Number
            }],
            totalClaimed: { type: Number, default: 0 }
        },
        novelProducts: {
            items: [{
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'NovelProduct' },
                title: String,
                status: String, // Developed / Implemented
                pointsClaimed: Number
            }],
            totalClaimed: { type: Number, default: 0 }
        },
        projectsConsultancies: {
            items: [{
                projectId: { type: mongoose.Schema.Types.ObjectId, refPath: 'research.projectsConsultancies.items.projectType' },
                projectType: { type: String, enum: ['FundedProject', 'Consultancy'] },
                title: String,
                agency: String,
                amountInLakhs: Number,
                status: String, // Shortlisted / Sanctioned
                pointsClaimed: Number
            }],
            totalClaimed: { type: Number, default: 0 }
        },
        scopusCitations: { type: Number, default: 0 },
        hIndex2024: { type: Number, default: 0 },
        hIndex2025: { type: Number, default: 0 },
        scopusCitationScore: { type: Number, default: 0 },
        scopusHIndexScore: { type: Number, default: 0 },
        totalClaimed: { type: Number, default: 0 }
    },

    // 3. Extension / Value Addition
    valueAddition: {
        resourceUtilization: {
            items: [{
                eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResourceUtilization' },
                event: String,
                role: String, // Organized, Resource Person, Participated
                pointsClaimed: Number
            }],
            totalClaimed: { type: Number, default: 0 }
        },
        expertiseContribution: {
            items: [{
                contributionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contribution' },
                activityName: String,
                pointsClaimed: Number
            }],
            totalClaimed: { type: Number, default: 0 } // Capped at max 10
        },
        totalClaimed: { type: Number, default: 0 }
    },

    // 4. Administrative Responsibilities
    administration: {
        items: [{
            activityName: String,
            level: String, // Central / Dept
            pointsClaimed: Number
        }],
        totalClaimed: { type: Number, default: 0 } // Capped at max 20
    },

    // PART-C: HOD Evaluation (II. Interpersonal Skills - Max 50 points)
    hodEvaluation: {
        interpersonalRatings: [{
            parameterId: Number,
            parameterText: String,
            rating: { type: Number, min: 1, max: 5 }
        }],
        totalInterpersonalPoints: { type: Number, default: 0 },
        comments: String,
        evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
        evaluationDate: Date
    },

    // R&D Admin input
    rndEvaluation: {
        comments: String,
        evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
        evaluationDate: Date
    }
}, { timestamps: true });

AppraisalSchema.index({ facultyId: 1, academicYearId: 1 }, { unique: true });

module.exports = mongoose.model("Appraisal", AppraisalSchema);
