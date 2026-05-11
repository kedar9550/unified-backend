const AcademicYear = require('../academicYear/academicYear.model');
const Department = require('../academics/department.model');
const Program = require('../academics/program.model');
const Branch = require('../academics/branch.model');
const Employee = require('../employee/employee.model');
const Role = require('../role/role.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const FacultyFeedResult = require('../FacultyFeedbackResults/FacultyFeedResult.model');
const Discrepancy = require('../discrepancy/discrepancy.model');

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
