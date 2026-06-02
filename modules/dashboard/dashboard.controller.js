const AcademicYear = require('../academicYear/academicYear.model');
const Department = require('../academics/department.model');
const Program = require('../academics/program.model');
const Branch = require('../academics/branch.model');
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
            allYearObjs
        ] = await Promise.all([
            AcademicYear.countDocuments(),
            Department.countDocuments(),
            Program.countDocuments(),
            Branch.countDocuments(),
            Employee.countDocuments(),
            Role.countDocuments(),
            AcademicYear.find({}).populate('programs.activeSemesterTypeId', 'name').lean()
        ]);

        // Filter for active years in JS
        const activeYearObjs = allYearObjs.filter(ay => ay.programs && ay.programs.some(p => p.isActive));

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
            lowRatingsCount,
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
                { $group: { _id: null, avg: { $avg: "$overallPercentage" } } }
            ]),
            // Low Ratings
            FacultyFeedResult.countDocuments({ overallPercentage: { $lt: 60 } }),
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
        const activeYearObjs = allYearObjs.filter(ay => ay.programs && ay.programs.some(p => p.isActive));
        
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
                    rating: (f.overallPercentage / 20).toFixed(1),
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
        
        const activeYearObjs = allYearObjs.filter(ay => ay.programs && ay.programs.some(p => p.isActive));
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
