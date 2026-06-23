const AcademicYear = require('../academicYear/academicYear.model');
const Department = require('../academics/department.model');
const Program = require('../academics/program.model');
const Branch = require('../academics/branch.model');
const School = require('../academics/school.model');
const Employee = require('../employee/employee.model');
const Role = require('../role/role.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const FacultyFeedResult = require('../FacultyFeedbackResults/FacultyFeedResult.model');
const Discrepancy = require('../discrepancy/discrepancy.model');
const FacultySubjectResult = require('../FacultySubjectResult/FacultySubjectResult.model');
const Textbook = require('../Textbook/Textbook.model');
const BookChapter = require('../BookChapter/BookChapter.model');
const Journal = require('../Journal/Journal.model');
const Patent = require('../Patent/Patent.model');
const FundedProject = require('../FundedProject/FundedProject.model');
const Consultancy = require('../Consultancy/Consultancy.model');
const Conference = require('../Conference/Conference.model');
const PhdApplication = require('../PhdScholar/PhdApplication.model');
const NovelProduct = require('../NovelProduct/NovelProduct.model');
const FacultyAdministration = require('../FacultyAdministration/FacultyAdministration.model');
const FacultyProctoringEntry = require('../FacultyProctoringEntry/FacultyProctoringEntry.model');
const ResourceUtilization = require('../ResourceUtilization/ResourceUtilization.model');
const Contribution = require('../Contribution/Contribution.model');
const { getHODDepartments } = require('../../utils/hodHelper');
const ProctorMapping = require('../ProctorMapping/ProctorMapping.model');
const Appraisal = require('../Appraisal/Appraisal.model');

exports.getUniprimeDashboardData = async (req, res, next) => {
    try {
        // Parallel counts
        const [
            academicYearsCount,
            departmentsCount,
            programsCount,
            branchesCount,
            usersCount,
            rolesCount,
            schoolsCount,
            allYearObjs
        ] = await Promise.all([
            AcademicYear.countDocuments(),
            Department.countDocuments(),
            Program.countDocuments(),
            Branch.countDocuments(),
            Employee.countDocuments(),
            Role.countDocuments(),
            School.countDocuments(),
            AcademicYear.find({}).populate('programs.activeSemesterTypeId', 'name').lean()
        ]);

        // Filter for active years in JS
        const activeYearObjs = allYearObjs.filter(ay => ay.isGlobalActive);

        // Format years from 2025-2026 to 2025-26
        const formatYear = (y) => {
            if (!y || !y.includes('-')) return y;
            const parts = y.split('-');
            const startYear = parts[0];
            const endYear = parts[1].length === 4 ? parts[1].substring(2) : parts[1];
            return `${startYear}-${endYear}`;
        };

        const activeYear = activeYearObjs.length > 0 
            ? activeYearObjs.map(ay => formatYear(ay.year)).join(' & ') 
            : 'N/A';
        
        const activeSemester = activeYearObjs[0]?.programs?.find(p => p.isActive)?.activeSemesterTypeId?.name || 'N/A';

        // Parallel lists (top 5)
        const [
            departmentsList,
            programsList,
            branchesList,
            recentUsersRaw
        ] = await Promise.all([
            Department.find().sort({ createdAt: -1 }).limit(5).lean(),
            Program.find().sort({ createdAt: -1 }).limit(5).lean(),
            Branch.find().sort({ createdAt: -1 }).limit(5).lean(),
            Employee.find().sort({ createdAt: -1 }).limit(5).lean()
        ]);

        // Map recent users
        const recentUsers = await Employee.aggregate([
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: "userapproles",
                    localField: "_id",
                    foreignField: "userId",
                    as: "userRole"
                }
            },
            { $unwind: { path: "$userRole", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "roles",
                    localField: "userRole.role",
                    foreignField: "_id",
                    as: "roleInfo"
                }
            },
            { $unwind: { path: "$roleInfo", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    name: "$name",
                    email: "$email",
                    role: { $ifNull: ["$roleInfo.name", "Unassigned"] },
                    time: "$createdAt"
                }
            }
        ]);

        //console.log("Recent Users:", recentUsers);

        // Role distribution aggregation
        const roleDistributionRaw = await UserAppRole.aggregate([
            { $match: { userModel: 'Employee' } },
            {
                $lookup: {
                    from: 'roles',
                    localField: 'role',
                    foreignField: '_id',
                    as: 'roleInfo'
                }
            },
            { $unwind: '$roleInfo' },
            {
                $group: {
                    _id: '$roleInfo.name',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const roleDistribution = roleDistributionRaw.map(r => ({
            label: r._id,
            value: r.count,
            color: 'primary'
        }));

        // Normalize lists keys for the frontend
        const mappedDepartments = departmentsList.map(d => ({
            _id: d._id,
            departmentName: d.name,
            departmentCode: d.code
        }));

        const mappedPrograms = programsList.map(p => ({
            _id: p._id,
            programName: p.name,
            programCode: p.code
        }));

        const mappedBranches = branchesList.map(b => ({
            _id: b._id,
            branchName: b.name,
            branchCode: b.code
        }));

        res.status(200).json({
            status: 'success',
            data: {
                academicYearsCount,
                activeYear,
                activeSemester,
                departmentsCount,
                programsCount,
                branchesCount,
                schoolsCount,
                usersCount,
                rolesCount,
                departmentsList: mappedDepartments,
                programsList: mappedPrograms,
                branchesList: mappedBranches,
                recentUsers,
                roleDistribution
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        next(error);
    }
};

exports.getFeedbackDashboardData = async (req, res, next) => {
    try {
        // Format years from 2025-2026 to 2025-26
        const formatYear = (y) => {
            if (!y || !y.includes('-')) return y;
            const parts = y.split('-');
            const startYear = parts[0];
            const endYear = parts[1].length === 4 ? parts[1].substring(2) : parts[1];
            return `${startYear}-${endYear}`;
        };

        const [
            totalFacultiesCount,
            processedFeedbacksCount,
            avgRatingData,
            lowRatingsData,
            recentFeedbacks,
            discrepancies,
            allYearObjs
        ] = await Promise.all([
            // Total Faculties
            Employee.countDocuments(),
            // Processed Feedbacks
            FacultyFeedResult.countDocuments(),
            // Avg Rating
            FacultyFeedResult.aggregate([
                { $group: { _id: null, avg: { $avg: "$percentage" } } }
            ]),
            // Low Ratings
            FacultyFeedResult.aggregate([
                {
                    $group: {
                        _id: {
                            facultyId: "$facultyId",
                            academicYearId: "$academicYearId",
                            programId: "$programId",
                            branchId: "$branchId",
                            subjectCode: "$subjectCode",
                            section: "$section",
                            semesterNumber: "$semesterNumber",
                            yearNumber: "$yearNumber"
                        },
                        avgPerc: { $avg: "$percentage" }
                    }
                },
                { $match: { avgPerc: { $lt: 60 } } },
                { $count: "count" }
            ]),
            // Recent Feedbacks
            FacultyFeedResult.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('academicYearId', 'year')
                .populate('semesterTypeId', 'name')
                .lean(),
            // Recent Discrepancies
            Discrepancy.find({ section: 'FEEDBACK', status: 'PENDING' })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean(),
            // Active Academic Years
            AcademicYear.find({}).populate('programs.activeSemesterTypeId', 'name').lean()
        ]);

        const avgRatingValue = avgRatingData.length > 0 ? (avgRatingData[0].avg / 20).toFixed(1) : "0.0";
        const lowRatingsCount = lowRatingsData.length > 0 ? lowRatingsData[0].count : 0;
        const activeYearObjs = allYearObjs.filter(ay => ay.isGlobalActive);
        
        const activeYearStr = activeYearObjs.length > 0 
            ? [...new Set(activeYearObjs.map(ay => formatYear(ay.year)))].join(' & ') 
            : 'N/A';
            
        const activeSemester = activeYearObjs.length > 0
            ? [...new Set(activeYearObjs.flatMap(ay => ay.programs.filter(p => p.isActive).map(p => p.activeSemesterTypeId?.name)))].filter(Boolean).join(' / ')
            : 'N/A';

        res.status(200).json({
            status: 'success',
            data: {
                totalFaculties: totalFacultiesCount,
                processedFeedbacks: processedFeedbacksCount,
                pendingFeedbacks: totalFacultiesCount > processedFeedbacksCount ? totalFacultiesCount - processedFeedbacksCount : 0,
                lowRatings: lowRatingsCount,
                avgRating: `${avgRatingValue}/5`,
                activeYear: activeYearStr,
                activeSemester,
                recentFeedbacks: recentFeedbacks.map(f => ({
                    name: f.facultyName,
                    dept: f.branch,
                    subject: `${f.subjectName} (${f.subjectCode})`,
                    rating: (f.percentage / 20).toFixed(1),
                    status: "Processed",
                    time: f.createdAt,
                    avatar: ""
                })),
                discrepancies: discrepancies.map(d => ({
                    name: d.facultyName,
                    subject: d.semester || "N/A",
                    issue: d.note,
                    detail: `Raised by ${d.raisedBy}`, // Should populate raisedBy if needed
                    time: d.createdAt
                })),
                chartData: [
                    { name: "Processed", value: processedFeedbacksCount, color: "#10B981" },
                    { name: "Pending", value: totalFacultiesCount > processedFeedbacksCount ? totalFacultiesCount - processedFeedbacksCount : 0, color: "#F59E0B" },
                    { name: "Low Ratings", value: lowRatingsCount, color: "#EF4444" }
                ]
            }
        });
    } catch (error) {
        console.error('Error fetching feedback dashboard data:', error);
        next(error);
    }
};

exports.getExamDashboardData = async (req, res, next) => {
    try {
        const formatYear = (y) => {
            if (!y || !y.includes('-')) return y;
            const parts = y.split('-');
            const startYear = parts[0];
            const endYear = parts[1].length === 4 ? parts[1].substring(2) : parts[1];
            return `${startYear}-${endYear}`;
        };

        const [
            totalFacultiesCount,
            submittedResultsCount,
            uniqueSubmittedFaculties,
            avgPassRateData,
            discrepancies,
            recentSubmissions,
            allYearObjs
        ] = await Promise.all([
            // Total Faculties
            Employee.countDocuments(),
            // Total Submitted Subject Results
            FacultySubjectResult.countDocuments(),
            // Unique Faculties who submitted
            FacultySubjectResult.distinct('facultyId'),
            // Avg Pass Rate
            FacultySubjectResult.aggregate([
                { $group: { _id: null, avg: { $avg: "$passPercentage" } } }
            ]),
            // Pending Discrepancies (Exam relevant)
            Discrepancy.find({ 
                status: 'PENDING',
                $or: [
                    { section: 'TEACHING' },
                    { section: 'PROCTORING', proctoringType: 'PASS_COUNT' },
                    { section: 'OTHER' }
                ]
            }).sort({ createdAt: -1 }).limit(5).lean(),
            // Recent Submissions
            FacultySubjectResult.find()
                .sort({ updatedAt: -1 })
                .limit(5)
                .populate('uploadedBy', 'name profileImage')
                .lean(),
            // Active Academic Years
            AcademicYear.find({}).populate('programs.activeSemesterTypeId', 'name').lean()
        ]);

        const submittedFacultiesCount = uniqueSubmittedFaculties.length;
        
        let avgPassRate = "0.0";
        if (avgPassRateData.length > 0 && avgPassRateData[0].avg !== null) {
            avgPassRate = Number(avgPassRateData[0].avg).toFixed(1);
        }
        
        const activeYearObjs = allYearObjs.filter(ay => ay.isGlobalActive);
        const activeYearStr = activeYearObjs.length > 0 
            ? [...new Set(activeYearObjs.map(ay => formatYear(ay.year)))].join(' & ') 
            : 'N/A';
        const activeSemester = activeYearObjs.length > 0
            ? [...new Set(activeYearObjs.flatMap(ay => ay.programs.filter(p => p.isActive).map(p => p.activeSemesterTypeId?.name)))].filter(Boolean).join(' / ')
            : 'N/A';

        // Discrepancy count
        const totalDiscrepancies = await Discrepancy.countDocuments({
            status: 'PENDING',
            $or: [
                { section: 'TEACHING' },
                { section: 'PROCTORING', proctoringType: 'PASS_COUNT' },
                { section: 'OTHER' }
            ]
        });

        res.status(200).json({
            status: 'success',
            data: {
                totalFaculties: totalFacultiesCount,
                submittedFaculties: submittedFacultiesCount,
                pendingSubmissions: totalFacultiesCount > submittedFacultiesCount ? totalFacultiesCount - submittedFacultiesCount : 0,
                submittedResults: submittedResultsCount,
                discrepanciesCount: totalDiscrepancies,
                overallPassRate: `${avgPassRate}%`,
                activeYear: activeYearStr,
                activeSemester,
                recentSubmissions: recentSubmissions.map(s => ({
                    name: s.facultyName || "Unknown",
                    institutionId: s.facultyId,
                    dept: s.branch || "N/A",
                    subject: `${s.courseName || "N/A"} (${s.courseCode || "N/A"})`,
                    status: "Submitted",
                    time: s.updatedAt,
                    avatar: s.uploadedBy?.profileImage ? `/uploads/profile/${s.uploadedBy.profileImage}` : ""
                })),
                discrepancies: discrepancies.map(d => ({
                    name: d.facultyName || "Unknown",
                    subject: d.semester || "N/A",
                    issue: d.note || "No note",
                    time: d.createdAt
                })),
                submissionChart: [
                    { name: "Submitted", value: submittedFacultiesCount, color: "#2563EB" },
                    { name: "Pending", value: totalFacultiesCount > submittedFacultiesCount ? totalFacultiesCount - submittedFacultiesCount : 0, color: "#F59E0B" },
                ]
            }
        });
    } catch (error) {
        console.error('EXAM DASHBOARD ERROR:', error);
        next(error);
    }
};

exports.getHODDashboardData = async (req, res, next) => {
    try {
        // 1. Get HOD Departments using the helper
        const deptIds = await getHODDepartments(req.user);
        
        if (!deptIds || deptIds.length === 0) {
            return res.status(200).json({
                status: 'success',
                data: {
                    totalFaculty: 0,
                    totalPrograms: 0,
                    departments: [],
                    pendingCounts: {
                        research: 0,
                        proctoring: 0,
                        administration: 0,
                        resourceUtilization: 0,
                        contribution: 0,
                        total: 0
                    },
                    researchStats: [],
                    recentActivities: [],
                    topFaculty: []
                }
            });
        }

        // 2. Fetch department details
        const depts = await Department.find({ _id: { $in: deptIds } }).select('name code').lean();
        const deptNames = depts.map(d => d.name);

        // 3. Find all active faculty members under HOD's departments
        const facultyDocs = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ],
            isActive: true
        }).select('_id name institutionId department coreDepartment designation email profileImage').lean();

        const facultyIds = facultyDocs.map(f => f._id);

        if (facultyIds.length === 0) {
            return res.status(200).json({
                status: 'success',
                data: {
                    totalFaculty: 0,
                    totalPrograms: depts.length,
                    departments: deptNames,
                    pendingCounts: {
                        research: 0,
                        proctoring: 0,
                        administration: 0,
                        resourceUtilization: 0,
                        contribution: 0,
                        total: 0
                    },
                    researchStats: [],
                    recentActivities: [],
                    topFaculty: []
                }
            });
        }

        // 4. Calculate pending approval counts in parallel
        const [
            pendingTextbooks,
            pendingChapters,
            pendingJournals,
            pendingPatents,
            pendingProjects,
            pendingConsultancies,
            pendingConferences,
            pendingPhds,
            pendingProducts,
            pendingProctoring,
            pendingAdmin,
            pendingResource,
            pendingContribution
        ] = await Promise.all([
            Textbook.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            BookChapter.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            Journal.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            Patent.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            FundedProject.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            Consultancy.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            Conference.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            PhdApplication.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            NovelProduct.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            FacultyProctoringEntry.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending' }),
            FacultyAdministration.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending' }),
            ResourceUtilization.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' }),
            Contribution.countDocuments({ facultyId: { $in: facultyIds }, status: 'Pending at HOD' })
        ]);

        const pendingResearchCount = pendingTextbooks + pendingChapters + pendingJournals + pendingPatents + pendingProjects + pendingConsultancies + pendingConferences + pendingPhds + pendingProducts;
        const totalPending = pendingResearchCount + pendingProctoring + pendingAdmin + pendingResource + pendingContribution;

        // 5. Aggregate overall department research counts for charting (approved & pending)
        const [
            journalsCount,
            conferencesCount,
            patentsCount,
            textbooksCount,
            chaptersCount,
            projectsCount,
            consultanciesCount,
            phdsCount,
            productsCount
        ] = await Promise.all([
            Journal.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } }),
            Conference.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } }),
            Patent.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } }),
            Textbook.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } }),
            BookChapter.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } }),
            FundedProject.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } }),
            Consultancy.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } }),
            PhdApplication.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } }),
            NovelProduct.countDocuments({ facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } })
        ]);

        const researchStats = [
            { name: 'Journals', value: journalsCount, color: '#3B82F6' },
            { name: 'Conferences', value: conferencesCount, color: '#10B981' },
            { name: 'Patents', value: patentsCount, color: '#F59E0B' },
            { name: 'Text Books', value: textbooksCount, color: '#8B5CF6' },
            { name: 'Book Chapters', value: chaptersCount, color: '#EC4899' },
            { name: 'Projects & Consultancies', value: projectsCount + consultanciesCount, color: '#06B6D4' },
            { name: 'Ph.D. & Products', value: phdsCount + productsCount, color: '#64748B' }
        ].filter(item => item.value > 0);

        // 6. Aggregate publications count by faculty member
        const aggregateFacultyCounts = async (Model) => {
            return Model.aggregate([
                { $match: { facultyId: { $in: facultyIds }, status: { $in: ['Approved', 'Pending at R&D', 'Pending at HOD'] } } },
                { $group: { _id: '$facultyId', count: { $sum: 1 } } }
            ]);
        };

        const [
            journalFacultyCounts,
            conferenceFacultyCounts,
            patentFacultyCounts,
            textbookFacultyCounts,
            chapterFacultyCounts,
            projectFacultyCounts,
            consultancyFacultyCounts,
            phdFacultyCounts,
            productFacultyCounts
        ] = await Promise.all([
            aggregateFacultyCounts(Journal),
            aggregateFacultyCounts(Conference),
            aggregateFacultyCounts(Patent),
            aggregateFacultyCounts(Textbook),
            aggregateFacultyCounts(BookChapter),
            aggregateFacultyCounts(FundedProject),
            aggregateFacultyCounts(Consultancy),
            aggregateFacultyCounts(PhdApplication),
            aggregateFacultyCounts(NovelProduct)
        ]);

        const facultyActivityMap = {};
        const mergeCounts = (countsList) => {
            for (const item of countsList) {
                const fid = item._id.toString();
                facultyActivityMap[fid] = (facultyActivityMap[fid] || 0) + item.count;
            }
        };

        mergeCounts(journalFacultyCounts);
        mergeCounts(conferenceFacultyCounts);
        mergeCounts(patentFacultyCounts);
        mergeCounts(textbookFacultyCounts);
        mergeCounts(chapterFacultyCounts);
        mergeCounts(projectFacultyCounts);
        mergeCounts(consultancyFacultyCounts);
        mergeCounts(phdFacultyCounts);
        mergeCounts(productFacultyCounts);

        const topFaculty = facultyDocs.map(f => {
            const fid = f._id.toString();
            return {
                _id: f._id,
                name: f.name,
                institutionId: f.institutionId,
                designation: f.designation,
                email: f.email,
                profileImage: f.profileImage,
                activityCount: facultyActivityMap[fid] || 0
            };
        })
        .sort((a, b) => b.activityCount - a.activityCount)
        .slice(0, 5);

        // 7. Get recent activities feed (limit to 5)
        const [
            recentJournals,
            recentPatents,
            recentTextbooks,
            recentProctoring,
            recentResourceUtil
        ] = await Promise.all([
            Journal.find({ facultyId: { $in: facultyIds } }).sort({ createdAt: -1 }).limit(5).populate('facultyId', 'name profileImage').lean(),
            Patent.find({ facultyId: { $in: facultyIds } }).sort({ createdAt: -1 }).limit(5).populate('facultyId', 'name profileImage').lean(),
            Textbook.find({ facultyId: { $in: facultyIds } }).sort({ createdAt: -1 }).limit(5).populate('facultyId', 'name profileImage').lean(),
            FacultyProctoringEntry.find({ facultyId: { $in: facultyIds } }).sort({ createdAt: -1 }).limit(5).populate('facultyId', 'name profileImage').lean(),
            ResourceUtilization.find({ facultyId: { $in: facultyIds } }).sort({ createdAt: -1 }).limit(5).populate('facultyId', 'name profileImage').lean()
        ]);

        const recentActivities = [];

        recentJournals.forEach(item => {
            recentActivities.push({
                type: 'Journal',
                title: item.paperTitle,
                facultyName: item.facultyId?.name || 'Unknown',
                profileImage: item.facultyId?.profileImage,
                status: item.status,
                createdAt: item.createdAt
            });
        });

        recentPatents.forEach(item => {
            recentActivities.push({
                type: 'Patent',
                title: item.title,
                facultyName: item.facultyId?.name || 'Unknown',
                profileImage: item.facultyId?.profileImage,
                status: item.status,
                createdAt: item.createdAt
            });
        });

        recentTextbooks.forEach(item => {
            recentActivities.push({
                type: 'Text Book',
                title: item.title,
                facultyName: item.facultyId?.name || 'Unknown',
                profileImage: item.facultyId?.profileImage,
                status: item.status,
                createdAt: item.createdAt
            });
        });

        recentProctoring.forEach(item => {
            recentActivities.push({
                type: 'Proctoring',
                title: 'Student Proctoring Entry',
                facultyName: item.facultyId?.name || 'Unknown',
                profileImage: item.facultyId?.profileImage,
                status: item.status,
                createdAt: item.createdAt
            });
        });

        recentResourceUtil.forEach(item => {
            recentActivities.push({
                type: 'Resource Utilization',
                title: `${item.activityCategory} - ${item.activityType}`,
                facultyName: item.facultyId?.name || 'Unknown',
                profileImage: item.facultyId?.profileImage,
                status: item.status,
                createdAt: item.createdAt
            });
        });

        recentActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const finalRecentActivities = recentActivities.slice(0, 5);

        res.status(200).json({
            status: 'success',
            data: {
                totalFaculty: facultyDocs.length,
                totalPrograms: depts.length,
                departments: deptNames,
                pendingCounts: {
                    research: pendingResearchCount,
                    proctoring: pendingProctoring,
                    administration: pendingAdmin,
                    resourceUtilization: pendingResource,
                    contribution: pendingContribution,
                    total: totalPending
                },
                researchStats,
                recentActivities: finalRecentActivities,
                topFaculty
            }
        });

    } catch (error) {
        console.error('Error fetching HOD dashboard data:', error);
        next(error);
    }
};

exports.getResearchDeanDashboardData = async (req, res, next) => {
    try {
        const models = [
            { name: 'Textbook', model: Textbook },
            { name: 'BookChapter', model: BookChapter },
            { name: 'Journal', model: Journal },
            { name: 'Patent', model: Patent },
            { name: 'FundedProject', model: FundedProject },
            { name: 'Consultancy', model: Consultancy },
            { name: 'Conference', model: Conference },
            { name: 'PhdApplication', model: PhdApplication },
            { name: 'NovelProduct', model: NovelProduct }
        ];

        // 1. Fetch status counts for all models in parallel
        const counts = await Promise.all(models.map(async ({ model }) => {
            return model.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);
        }));

        let approved = 0;
        let pendingHod = 0;
        let pendingRnd = 0;
        let rejected = 0;
        let total = 0;

        let journalApproved = 0;
        let conferenceApproved = 0;
        let chapterApproved = 0;
        let textbookApproved = 0;
        let othersApproved = 0;

        models.forEach(({ name }, idx) => {
            const modelCounts = counts[idx];
            modelCounts.forEach(({ _id: status, count }) => {
                total += count;
                if (status === 'Approved') {
                    approved += count;
                    if (name === 'Journal') journalApproved += count;
                    else if (name === 'Conference') conferenceApproved += count;
                    else if (name === 'BookChapter') chapterApproved += count;
                    else if (name === 'Textbook') textbookApproved += count;
                    else othersApproved += count;
                } else if (status === 'Pending at HOD') {
                    pendingHod += count;
                } else if (status === 'Pending at R&D') {
                    pendingRnd += count;
                } else if (status && status.startsWith('Rejected')) {
                    rejected += count;
                }
            });
        });

        // 2. Fetch monthly trend data for approved publications (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const trendResults = await Promise.all(models.map(({ model }) => {
            return model.aggregate([
                {
                    $match: {
                        status: 'Approved',
                        createdAt: { $gte: twelveMonthsAgo }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: "$createdAt" },
                            month: { $month: "$createdAt" }
                        },
                        count: { $sum: 1 }
                    }
                }
            ]);
        }));

        const dynamicMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const trendData = [];
        const now = new Date();

        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            trendData.push({
                year: d.getFullYear(),
                month: d.getMonth() + 1,
                name: dynamicMonthNames[d.getMonth()],
                publications: 0
            });
        }

        trendResults.forEach(modelTrend => {
            modelTrend.forEach(({ _id, count }) => {
                const match = trendData.find(t => t.year === _id.year && t.month === _id.month);
                if (match) {
                    match.publications += count;
                }
            });
        });

        const formattedTrendData = trendData.map(({ name, publications }) => ({ name, publications }));

        // 3. Publications by Type (Pie chart)
        const pieData = [
            { name: 'Journal Articles', value: journalApproved, color: '#3b82f6' },
            { name: 'Conference Papers', value: conferenceApproved, color: '#10b981' },
            { name: 'Book Chapters', value: chapterApproved, color: '#f59e0b' },
            { name: 'Books', value: textbookApproved, color: '#8b5cf6' },
            { name: 'Others', value: othersApproved, color: '#ec4899' }
        ];

        // 4. Aggregate department-wise publication counts (Top Departments)
        const departmentsList = await Department.find().select('name code').lean();
        const deptCountMap = {};
        departmentsList.forEach(d => {
            deptCountMap[d._id.toString()] = {
                name: d.name,
                code: d.code,
                value: 0
            };
        });

        const deptAggResults = await Promise.all(models.map(({ model }) => {
            return model.aggregate([
                { $match: { status: 'Approved' } },
                {
                    $lookup: {
                        from: "employees",
                        localField: "facultyId",
                        foreignField: "_id",
                        as: "faculty"
                    }
                },
                { $unwind: "$faculty" },
                {
                    $project: {
                        deptId: { $ifNull: ["$faculty.coreDepartment", "$faculty.department"] }
                    }
                },
                { $match: { deptId: { $ne: null } } },
                {
                    $group: {
                        _id: "$deptId",
                        count: { $sum: 1 }
                    }
                }
            ]);
        }));

        deptAggResults.forEach(modelResult => {
            modelResult.forEach(({ _id, count }) => {
                const deptIdStr = _id.toString();
                if (deptCountMap[deptIdStr]) {
                    deptCountMap[deptIdStr].value += count;
                }
            });
        });

        const sortedDepts = Object.values(deptCountMap)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const deptColors = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b'];
        const departmentsData = sortedDepts.map((dept, index) => ({
            name: dept.name,
            value: dept.value,
            color: deptColors[index] || '#64748b'
        }));

        // 5. Research Impact metrics from Approved Journals
        const approvedJournals = await Journal.find({ status: 'Approved' }).select('citations hIndex').lean();
        let citationsSum = 0;
        let maxHIndex = 0;
        let i10IndexCount = 0;

        approvedJournals.forEach(j => {
            const cit = Number(j.citations) || 0;
            const h = Number(j.hIndex) || 0;
            citationsSum += cit;
            if (h > maxHIndex) {
                maxHIndex = h;
            }
            if (cit >= 10) {
                i10IndexCount++;
            }
        });

        const researchImpact = [
            { label: 'Citations', value: citationsSum, trend: '+15%', icon: '“', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
            { label: 'h-index', value: maxHIndex, trend: '+5%', icon: 'h.', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
            { label: 'i10-index', value: i10IndexCount, trend: '+10%', icon: 'i10', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }
        ];

        // 6. Announcements
        const announcements = [
            { date: '02 Jun 2026', title: 'R&D Seed Grant Application', desc: 'Faculty members are invited to apply for Aditya University Seed Grant 2026.' },
            { date: '28 May 2026', title: 'Research Publication Policy 2026', desc: 'Updated incentives structure for Q1/Q2 Scopus Journals has been published.' },
            { date: '15 May 2026', title: 'IPR and Patent Filing Workshop', desc: 'A hands-on workshop on filing patents will be organized on 12th June.' }
        ];

        res.status(200).json({
            status: 'success',
            data: {
                totalPublications: total,
                approved,
                pendingHod,
                pendingRnd,
                rejected,
                trendData: formattedTrendData,
                pieData,
                departments: departmentsData,
                researchImpact,
                announcements
            }
        });

    } catch (error) {
        console.error('Error fetching Research Dean dashboard data:', error);
        next(error);
    }
};

exports.getFacultyDashboardData = async (req, res, next) => {
    try {
        const employee = await Employee.findById(req.user.userId).select('institutionId').lean();
        if (!employee) {
            return res.status(404).json({ message: "Employee not found" });
        }

        let ayQuery = {};
        if (req.query.academicYear) {
            ayQuery = { year: req.query.academicYear };
        } else {
            ayQuery = { isGlobalActive: true };
        }
        let ayDoc = await AcademicYear.findOne(ayQuery);
        if (!ayDoc) {
            ayDoc = await AcademicYear.findOne({}).sort({ year: -1 });
        }

        const filter = { facultyId: req.user.userId };
        if (ayDoc) {
            filter.academicYear = ayDoc._id;
        }

        const [
            textbooks,
            chapters,
            journals,
            patents,
            projects,
            consultancies,
            conferences,
            phds,
            products,
            resourceUtils,
            contributions,
            proctorAssignments,
            appraisal
        ] = await Promise.all([
            Textbook.find(filter).populate('academicYear', 'year').lean(),
            BookChapter.find(filter).populate('academicYear', 'year').lean(),
            Journal.find(filter).populate('academicYear', 'year').lean(),
            Patent.find(filter).populate('academicYear', 'year').lean(),
            FundedProject.find(filter).populate('academicYear', 'year').lean(),
            Consultancy.find(filter).populate('academicYear', 'year').lean(),
            Conference.find(filter).populate('academicYear', 'year').lean(),
            PhdApplication.find(filter).populate('academicYear', 'year').lean(),
            NovelProduct.find(filter).populate('academicYear', 'year').lean(),
            ResourceUtilization.find({ facultyId: req.user.userId, ...(ayDoc ? { academicYear: ayDoc._id } : {}) }).populate('academicYear', 'year').lean(),
            Contribution.find({ facultyId: req.user.userId, ...(ayDoc ? { academicYear: ayDoc._id } : {}) }).populate('academicYear', 'year').lean(),
            ProctorMapping.find({ currentProctorId: employee.institutionId }).lean(),
            Appraisal.findOne({ facultyId: req.user.userId, ...(ayDoc ? { academicYearId: ayDoc._id } : {}) }).lean()
        ]);

        const totalResearch = textbooks.length + chapters.length + journals.length + patents.length + 
                              projects.length + consultancies.length + conferences.length + phds.length + products.length;

        let approvedResearch = 0;
        let pendingResearch = 0;
        let rejectedResearch = 0;

        const allResearchItems = [
            ...textbooks.map(x => ({ ...x, type: 'Textbook' })),
            ...chapters.map(x => ({ ...x, type: 'Book Chapter' })),
            ...journals.map(x => ({ ...x, type: 'Journal' })),
            ...patents.map(x => ({ ...x, type: 'Patent' })),
            ...projects.map(x => ({ ...x, type: 'Funded Project' })),
            ...consultancies.map(x => ({ ...x, type: 'Consultancy' })),
            ...conferences.map(x => ({ ...x, type: 'Conference' })),
            ...phds.map(x => ({ ...x, type: 'PhD Guiding' })),
            ...products.map(x => ({ ...x, type: 'Novel Product' }))
        ];

        allResearchItems.forEach(item => {
            const status = item.status || "";
            if (status === "Approved") {
                approvedResearch++;
            } else if (status.startsWith("Pending")) {
                pendingResearch++;
            } else if (status.startsWith("Rejected")) {
                rejectedResearch++;
            }
        });

        // Research types distribution for chart
        const researchTypeDistribution = [
            { name: "Journals", value: journals.length },
            { name: "Conferences", value: conferences.length },
            { name: "Patents", value: patents.length },
            { name: "Books & Chapters", value: textbooks.length + chapters.length },
            { name: "Projects & Consultancy", value: projects.length + consultancies.length },
            { name: "PhD Guiding & Tech", value: phds.length + products.length }
        ];

        // Self Appraisal info
        let appraisalStatus = "Not Started";
        let appraisalScore = 0;
        if (appraisal) {
            appraisalStatus = appraisal.status || "Draft";
            appraisalScore = (appraisal.teaching?.totalClaimed || 0) +
                             (appraisal.research?.totalClaimed || 0) +
                             (appraisal.valueAddition?.totalClaimed || 0) +
                             (appraisal.administration?.totalClaimed || 0);
        }

        // Recent activities feed
        const recentActivities = [];
        journals.forEach(item => {
            recentActivities.push({
                type: 'Journal',
                title: item.paperTitle,
                status: item.status,
                createdAt: item.createdAt
            });
        });
        conferences.forEach(item => {
            recentActivities.push({
                type: 'Conference',
                title: item.paperTitle,
                status: item.status,
                createdAt: item.createdAt
            });
        });
        patents.forEach(item => {
            recentActivities.push({
                type: 'Patent',
                title: item.title,
                status: item.status,
                createdAt: item.createdAt
            });
        });
        textbooks.forEach(item => {
            recentActivities.push({
                type: 'Text Book',
                title: item.title,
                status: item.status,
                createdAt: item.createdAt
            });
        });
        chapters.forEach(item => {
            recentActivities.push({
                type: 'Book Chapter',
                title: item.title,
                status: item.status,
                createdAt: item.createdAt
            });
        });
        resourceUtils.forEach(item => {
            recentActivities.push({
                type: 'Resource Utilization',
                title: `${item.activityCategory} - ${item.activityType}`,
                status: item.status,
                createdAt: item.createdAt
            });
        });
        contributions.forEach(item => {
            recentActivities.push({
                type: 'Contribution',
                title: `Category ${item.category} Contribution`,
                status: item.status,
                createdAt: item.createdAt
            });
        });

        recentActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const finalRecentActivities = recentActivities.slice(0, 5);

        // Recent research submissions list formatted for a table
        const formattedResearchList = allResearchItems.map(item => ({
            title: item.paperTitle || item.title || "Untitled",
            type: item.type,
            year: item.academicYear?.year || "N/A",
            status: item.status,
            createdAt: item.createdAt
        }));
        formattedResearchList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const recentResearchList = formattedResearchList.slice(0, 5);

        res.status(200).json({
            status: 'success',
            data: {
                totalResearch,
                approvedResearch,
                pendingResearch,
                rejectedResearch,
                proctoredStudentsCount: proctorAssignments.length,
                activitiesCount: resourceUtils.length + contributions.length,
                appraisalStatus,
                appraisalScore,
                researchTypeDistribution,
                recentActivities: finalRecentActivities,
                recentResearchList
            }
        });

    } catch (error) {
        console.error('Error fetching Faculty dashboard data:', error);
        next(error);
    }
};
