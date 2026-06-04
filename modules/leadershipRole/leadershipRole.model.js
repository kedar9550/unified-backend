const mongoose = require('mongoose');

const LeadershipRoleSchema = new mongoose.Schema({
    roleName: {
        type: String,
        required: true,
        unique: true,
        enum: ['Deans', 'Associate Deans', 'CoE', 'HoD', 'Chancellor', 'Pro-chancellor', 'Registrar', 'Vice-chancellor', 'Director Academics']
    },
    description: {
        type: String,
        default: ""
    },
    assignedFaculty: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }]
}, { timestamps: true });

// Helper function to sync leadership flag for all employees
async function syncAllEmployeesLeadership() {
    try {
        const Employee = require('../employee/employee.model');
        const LeadershipRole = mongoose.model('LeadershipRole');
        const employees = await Employee.find({});
        
        for (const emp of employees) {
            const hasRole = await LeadershipRole.exists({ assignedFaculty: emp._id });
            const targetStatus = hasRole ? "yes" : "no";
            
            // Force write the key physically to MongoDB for all documents
            await Employee.updateOne({ _id: emp._id }, { $set: { leadership: targetStatus } });
        }
    } catch (err) {
        console.error("Error in syncAllEmployeesLeadership:", err);
    }
}

// Hook on save (creation or document update)
LeadershipRoleSchema.post('save', async function () {
    await syncAllEmployeesLeadership();
});

// Hooks on update operations
LeadershipRoleSchema.post('updateOne', async function () {
    await syncAllEmployeesLeadership();
});
LeadershipRoleSchema.post('findOneAndUpdate', async function () {
    await syncAllEmployeesLeadership();
});

// Hooks on delete operations
LeadershipRoleSchema.post('findOneAndDelete', async function () {
    await syncAllEmployeesLeadership();
});

// Expose static helper
LeadershipRoleSchema.statics.syncAllEmployeesLeadership = syncAllEmployeesLeadership;

module.exports = mongoose.model('LeadershipRole', LeadershipRoleSchema);
