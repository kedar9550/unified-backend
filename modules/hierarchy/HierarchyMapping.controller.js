const HierarchyMapping = require('./HierarchyMapping.model');

// Create or Update Employee-to-Role Mapping
exports.upsertEmployeeToRole = async (req, res) => {
    try {
        const { empId, roleId } = req.body;
        if (!empId || !roleId) {
            return res.status(400).json({ success: false, message: "empId and roleId are required" });
        }

        const Employee = require('../employee/employee.model');
        const empExists = await Employee.findOne({ institutionId: empId });
        if (!empExists) {
            return res.status(400).json({ success: false, message: `Employee with ID ${empId} not found in the system.` });
        }

        const mapping = await HierarchyMapping.findOneAndUpdate(
            { empId },
            { roleId },
            { new: true, upsert: true }
        ).populate('roleId', 'name key');

        res.status(200).json({ success: true, data: mapping, message: "Mapping saved successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get All Employee-to-Role Mappings
exports.getEmployeeToRoleMappings = async (req, res) => {
    try {
        const mappings = await HierarchyMapping.find().populate('roleId', 'name key').lean();
        
        // Fetch employee details to append name
        const Employee = require('../employee/employee.model');
        const empIds = mappings.map(m => m.empId);
        const employees = await Employee.find({ institutionId: { $in: empIds } }, 'institutionId name').lean();
        
        const empMap = {};
        employees.forEach(emp => empMap[emp.institutionId] = emp.name);
        
        const mappedData = mappings.map(m => ({
            ...m,
            empName: empMap[m.empId] || "Unknown Employee"
        }));

        res.status(200).json({ success: true, data: mappedData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete Mapping
exports.deleteMapping = async (req, res) => {
    try {
        const { id } = req.params;
        await HierarchyMapping.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Mapping deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
