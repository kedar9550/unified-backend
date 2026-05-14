const Employee = require('../employee/employee.model');
const Textbook = require('../Textbook/Textbook.model');

// @desc    Get all research requests for HOD departments or Research Admin
// @route   GET /api/research-approval
// @access  Private (HOD, Research Dean, Research Coordinator)
exports.getResearchRequests = async (req, res) => {
    try {
        const { 
            type, 
            status, 
            duration, 
            fromDate, 
            toDate, 
            search 
        } = req.query;

        // Check if user has research management roles
        const userRoleNames = req.user.roles?.map(r => r.role?.toUpperCase()) || [];
        const isResearchAdmin = userRoleNames.includes('RESEARCH_DEAN') || userRoleNames.includes('RESEARCH_COORDINATOR');
        const isHOD = userRoleNames.includes('HOD');

        console.log(`[DEBUG] Research Approval Access - User: ${req.user.userId}, isResearchAdmin: ${isResearchAdmin}`);

        let facultyIds = [];
        let facultyMap = {};

        if (isResearchAdmin) {
            // Deans and Coordinators see everything at institutional level
        } else if (isHOD) {
            // Get HOD Departments
            let deptIds = req.user.hodDepartments || [];
            
            if (deptIds.length === 0) {
                const EmployeeAppRole = require('../userAppRole/userAppRole.model');
                const Role = require('../role/role.model');
                
                const hodRole = await Role.findOne({ name: 'HOD', app: process.env.APP_NAME || 'UNIFIED_SYSTEM' });
                if (hodRole) {
                    const mappings = await EmployeeAppRole.find({ userId: req.user.userId, role: hodRole._id });
                    for (const m of mappings) {
                        if (m.departments && m.departments.length > 0) {
                            deptIds = [...deptIds, ...m.departments];
                        }
                    }
                }
            }

            if (deptIds.length === 0) {
                return res.json({ success: true, data: [] });
            }

            // Fetch faculty for these departments
            const facultyDocs = await Employee.find({ coreDepartment: { $in: deptIds } }).select('_id name institutionId department coreDepartment profileImage');
            facultyIds = facultyDocs.map(f => f._id);
            facultyMap = facultyDocs.reduce((acc, f) => {
                acc[f._id.toString()] = f;
                return acc;
            }, {});
        } else {
            return res.status(403).json({ success: false, message: "Unauthorized access to research requests." });
        }

        // Build Base Query for Research Requests
        let query = {};
        if (!isResearchAdmin) {
            query.facultyId = { $in: facultyIds };
        }

        // Status Filter Logic
        if (status && status !== 'All') {
            if (status === 'Pending') {
                if (isResearchAdmin) query.status = 'Pending at R&D';
                else query.status = 'Pending at HOD';
            }
            else if (status === 'Approved') {
                if (isResearchAdmin) query.status = 'Approved';
                else query.status = { $in: ['Pending at R&D', 'Approved'] }; 
            }
            else if (status === 'Rejected') {
                if (isResearchAdmin) query.status = 'Rejected by R&D';
                else query.status = 'Rejected by HOD';
            }
            else query.status = status;
        } else if (!status) {
            // Default view when NO status is provided (initial load)
            if (isResearchAdmin) query.status = 'Pending at R&D';
            else if (isHOD) query.status = 'Pending at HOD';
        }

        // Date Filter
        if (duration && duration !== 'All') {
            const now = new Date();
            let pastDate = new Date();
            if (duration === '1month') {
                pastDate.setMonth(now.getMonth() - 1);
            } else if (duration === '6months') {
                pastDate.setMonth(now.getMonth() - 6);
            } else if (duration === '1year') {
                pastDate.setFullYear(now.getFullYear() - 1);
            }
            query.createdAt = { $gte: pastDate, $lte: now };
        } else if (fromDate && toDate) {
            query.createdAt = { 
                $gte: new Date(fromDate), 
                $lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)) 
            };
        }

        // Search Filter
        let searchRegex = null;
        if (search) {
            searchRegex = new RegExp(search, 'i');
        }

        let allRequests = [];

        // Fetch from specific collections based on 'type' parameter
        const typesToFetch = type && type !== 'All' ? [type] : ['Text Book']; 

        if (typesToFetch.includes('Text Book')) {
            let textbookQuery = { ...query };
            
            if (searchRegex && !isResearchAdmin) {
                textbookQuery.$or = [{ title: searchRegex }];
            }
            
            const textbooks = await Textbook.find(textbookQuery)
                .populate('facultyId', 'name institutionId department coreDepartment profileImage')
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of textbooks) {
                const fac = item.facultyId;
                if (!fac) continue;

                if (searchRegex) {
                    const matchesTitle = searchRegex.test(item.title);
                    const matchesName = searchRegex.test(fac.name);
                    const matchesId = searchRegex.test(fac.institutionId);
                    if (!matchesTitle && !matchesName && !matchesId) continue;
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Text Book',
                    faculty: fac,
                    title: item.title,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    hodComment: item.hodComment,
                    rndComment: item.rndComment,
                    approvedAmount: item.approvedAmount
                });
            }
        }

        // Sort combined results by date descending
        allRequests.sort((a, b) => b.createdAt - a.createdAt);

        res.json({
            success: true,
            data: allRequests
        });

    } catch (error) {
        console.error("Get Research Requests Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
