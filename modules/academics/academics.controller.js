const Department = require('./department.model');
const Program = require('./program.model');
const Branch = require('./branch.model');
const School = require('./school.model');

// ====================
// SCHOOL CONTROLLERS
// ====================

// @desc    Create a new school
// @route   POST /api/academics/schools
// @access  Private
exports.createSchool = async (req, res, next) => {
    try {
        const school = new School(req.body);
        const savedSchool = await school.save();
        res.status(201).json({ success: true, data: savedSchool });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'School name or code already exists.' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all schools
// @route   GET /api/academics/schools
// @access  Private
exports.getAllSchools = async (req, res, next) => {
    try {
        const query = req.query.status !== undefined ? { status: req.query.status === 'true' } : { status: true };
        const schools = await School.find(query);
        res.status(200).json({ success: true, data: schools });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update a school
// @route   PUT /api/academics/schools/:id
// @access  Private
exports.updateSchool = async (req, res, next) => {
    try {
        const school = await School.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!school) return res.status(404).json({ success: false, message: 'School not found' });
        res.status(200).json({ success: true, data: school });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a school
// @route   DELETE /api/academics/schools/:id
// @access  Private
exports.deleteSchool = async (req, res, next) => {
    try {
        const school = await School.findById(req.params.id);
        if (!school) return res.status(404).json({ success: false, message: 'School not found' });
        
        const deptCount = await Department.countDocuments({ schoolId: school._id });
        if (deptCount > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete school with existing departments' });
        }
        await school.deleteOne();
        res.status(200).json({ success: true, message: 'School deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ====================
// DEPARTMENT CONTROLLERS
// ====================

// @desc    Create a new department
// @route   POST /api/academics/departments
// @access  Private (UNIPRIME only)
exports.createDepartment = async (req, res, next) => {
    try {
        const department = new Department(req.body);
        const savedDept = await department.save();
        res.status(201).json({ success: true, data: savedDept });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                success: false, 
                message: `Duplicate value error: A department with this ${field} already exists.` 
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all departments
// @route   GET /api/academics/departments
// @access  Private
exports.getAllDepartments = async (req, res, next) => {
    try {
        const query = {};
        if (req.query.status !== undefined) {
            query.status = req.query.status === 'true';
        } else {
            query.status = true; // Default to active only as per requirement
        }

        if (req.query.programId) {
            // Find all branches for this program
            const branches = await Branch.find({ programId: req.query.programId }).select('departmentId');
            const deptIds = branches.map(b => b.departmentId);
            query._id = { $in: deptIds };
        }

        const departments = await Department.find(query).populate('schoolId');
        res.status(200).json({ success: true, data: departments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update a department
// @route   PUT /api/academics/departments/:id
// @access  Private (UNIPRIME only)
exports.updateDepartment = async (req, res, next) => {
    try {
        const department = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }
        res.status(200).json({ success: true, data: department });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a department
// @route   DELETE /api/academics/departments/:id
// @access  Private (UNIPRIME only)
exports.deleteDepartment = async (req, res, next) => {
    try {
        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }
        // Check if department has branches
        const branchesCount = await Branch.countDocuments({ departmentId: department._id });
        if (branchesCount > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete department with existing branches' });
        }
        await department.deleteOne();
        res.status(200).json({ success: true, message: 'Department deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ====================
// PROGRAM CONTROLLERS
// ====================

// @desc    Create a new program
// @route   POST /api/academics/programs
// @access  Private (UNIPRIME only)
exports.createProgram = async (req, res, next) => {
    try {
        const { name, code, type, description, status } = req.body;
        
        const program = new Program({ name, code, type, description, status });
        const savedProgram = await program.save();
        res.status(201).json({ success: true, data: savedProgram });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ 
                success: false, 
                message: `Duplicate value error: This program (name or code) already exists.` 
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all programs (optionally filter by department)
// @route   GET /api/academics/programs
// @access  Private
exports.getAllPrograms = async (req, res, next) => {
    try {
        const query = {};
        if (req.query.type) query.type = req.query.type;
        
        if (req.query.status !== undefined) {
            query.status = req.query.status === 'true';
        } else {
            query.status = true; // Default to active only
        }

        if (req.query.departmentId) {
            // Find all unique programs that have branches in this department
            const branches = await Branch.find({ departmentId: req.query.departmentId }).select('programId');
            const programIds = [...new Set(branches.map(b => b.programId.toString()))];
            query._id = { $in: programIds };
        }

        const programs = await Program.find(query);
        res.status(200).json({ success: true, data: programs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update a program
// @route   PUT /api/academics/programs/:id
// @access  Private (UNIPRIME only)
exports.updateProgram = async (req, res, next) => {
    try {
        const program = await Program.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!program) {
            return res.status(404).json({ success: false, message: 'Program not found' });
        }
        res.status(200).json({ success: true, data: program });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a program
// @route   DELETE /api/academics/programs/:id
// @access  Private (UNIPRIME only)
exports.deleteProgram = async (req, res, next) => {
    try {
        const program = await Program.findById(req.params.id);
        if (!program) {
            return res.status(404).json({ success: false, message: 'Program not found' });
        }
        // Check for associated branches
        const branchesCount = await Branch.countDocuments({ programId: program._id });
        if (branchesCount > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete program with existing branches' });
        }
        await program.deleteOne();
        res.status(200).json({ success: true, message: 'Program deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ====================
// BRANCH CONTROLLERS
// ====================

// @desc    Create a branch
// @route   POST /api/academics/branches
// @access  Private (UNIPRIME only)
exports.createBranch = async (req, res, next) => {
    try {
        const { programId, departmentId, name, code, status } = req.body;

        const program = await Program.findById(programId);
        if (!program) {
            return res.status(404).json({ success: false, message: 'Program not found' });
        }

        const dept = await Department.findById(departmentId);
        if (!dept) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }

        const branch = new Branch({ programId, departmentId, name, code, status });
        const savedBranch = await branch.save();
        res.status(201).json({ success: true, data: savedBranch });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Branch code already exists for this program.' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all branches (optionally filter by program)
// @route   GET /api/academics/branches
// @access  Private
exports.getAllBranches = async (req, res, next) => {
    try {
        const query = {};
        if (req.query.programId) query.programId = req.query.programId;
        if (req.query.departmentId) query.departmentId = req.query.departmentId;
        
        if (req.query.status !== undefined) {
            query.status = req.query.status === 'true';
        } else {
            query.status = true; // Default to active only
        }

        const branches = await Branch.find(query)
            .populate('programId')
            .populate('departmentId');
        res.status(200).json({ success: true, data: branches });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update a branch
// @route   PUT /api/academics/branches/:id
// @access  Private (UNIPRIME only)
exports.updateBranch = async (req, res, next) => {
    try {
        const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!branch) {
            return res.status(404).json({ success: false, message: 'Branch not found' });
        }
        res.status(200).json({ success: true, data: branch });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a branch
// @route   DELETE /api/academics/branches/:id
// @access  Private (UNIPRIME only)
exports.deleteBranch = async (req, res, next) => {
    try {
        const branch = await Branch.findById(req.params.id);
        if (!branch) {
            return res.status(404).json({ success: false, message: 'Branch not found' });
        }
        await branch.deleteOne();
        res.status(200).json({ success: true, message: 'Branch deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
