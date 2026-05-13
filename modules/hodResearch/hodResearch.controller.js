const Employee = require('../employee/employee.model');
const Textbook = require('../Textbook/Textbook.model');

// Optional other models if they exist. We'll wrap in try/catch or conditionally use them.
// const Journal = require('../Journal/Journal.model');
// const Patent = require('../Patent/Patent.model');
// const Conference = require('../Conference/Conference.model');
// const BookChapter = require('../BookChapter/BookChapter.model');
// const Consultancy = require('../Consultancy/Consultancy.model');
// const ProjectGrant = require('../ProjectGrant/ProjectGrant.model');

// @desc    Get all research requests for HOD departments
// @route   GET /api/hod/research-requests
// @access  Private (HOD)
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

        // 1. Get HOD Departments
        // Assuming req.user.hodDepartments is populated by the auth/role middleware,
        // or we fetch them if not available.
        let deptIds = req.user.hodDepartments || [];
        
        // Fallback: If not in req.user, fetch from userAppRole where role is HOD
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
            return res.json({ success: true, data: [] }); // No departments assigned
        }

        // 2. Fetch faculty whose coreDepartment matches any of the HOD's departments
        const facultyDocs = await Employee.find({ coreDepartment: { $in: deptIds } }).select('_id name institutionId department coreDepartment profileImage');
        const facultyIds = facultyDocs.map(f => f._id);
        const facultyMap = facultyDocs.reduce((acc, f) => {
            acc[f._id.toString()] = f;
            return acc;
        }, {});

        // 3. Build Base Query for Research Requests
        let query = { facultyId: { $in: facultyIds } };

        // Status Filter
        if (status && status !== 'All') {
            // Note: DB statuses might be 'Pending at HOD', 'Approved', 'Rejected by HOD'
            if (status === 'Pending') query.status = { $regex: /Pending/i };
            else if (status === 'Approved') query.status = { $regex: /Approved/i };
            else if (status === 'Rejected') query.status = { $regex: /Rejected/i };
            else query.status = status;
        }

        // Date Filter
        if (duration) {
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

        // Search Filter (applied later in JS since we need to match faculty name/ID)
        let searchRegex = null;
        if (search) {
            searchRegex = new RegExp(search, 'i');
        }

        let allRequests = [];

        // 4. Fetch from specific collections based on 'type' parameter
        const typesToFetch = type && type !== 'All' ? [type] : ['Text Book']; // Add more types later: 'Journal', 'Patent', etc.

        if (typesToFetch.includes('Text Book')) {
            let textbookQuery = { ...query };
            if (searchRegex) {
                // If search exists, we either match title OR we fetch all and filter by faculty name/id later
                textbookQuery.$or = [
                    { title: searchRegex }
                ];
            }
            
            const textbooks = await Textbook.find(searchRegex ? query : textbookQuery) // if searchRegex exists, we fetch all by query and filter in JS to catch faculty matches
                .populate('academicYear', 'year')
                .sort({ createdAt: -1 })
                .lean();

            for (const item of textbooks) {
                const fac = facultyMap[item.facultyId.toString()];
                if (searchRegex && !searchRegex.test(item.title) && !searchRegex.test(fac.name) && !searchRegex.test(fac.institutionId)) {
                    continue; // Skip if search doesn't match title, faculty name, or faculty id
                }
                
                allRequests.push({
                    _id: item._id,
                    type: 'Text Book',
                    faculty: fac,
                    title: item.title,
                    status: item.status,
                    createdAt: item.createdAt,
                    academicYear: item.academicYear,
                    // Additional fields for list view
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
        res.status(500).json({ success: false, message: error.message });
    }
};
