const AcademicYear = require('../academicYear/academicYear.model');
const Department = require('../academics/department.model');
const Program = require('../academics/program.model');
const Branch = require('../academics/branch.model');
const Employee = require('../employee/employee.model');
const Role = require('../role/role.model');
const UserAppRole = require('../userAppRole/userAppRole.model');

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
            activeYearObj
        ] = await Promise.all([
            AcademicYear.countDocuments(),
            Department.countDocuments(),
            Program.countDocuments(),
            Branch.countDocuments(),
            Employee.countDocuments(),
            Role.countDocuments(),
            AcademicYear.findOne({ isActive: true })
        ]);

        const activeYear = activeYearObj ? activeYearObj.year : 'None';

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
