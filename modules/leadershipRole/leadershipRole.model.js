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

const isLeadershipDesignation = (designation, leadershipRoles) => {
    if (!designation) return false;
    const cleanDesig = designation.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const rolesToCheck = [...(leadershipRoles || [])];
    if (!rolesToCheck.some(r => r && r.toLowerCase().trim() === 'head')) {
        rolesToCheck.push('Head');
    }
    return rolesToCheck.some(role => {
        if (!role) return false;
        let cleanRole = role.toLowerCase().trim();
        if (cleanRole.endsWith('s') && !['coe', 'chancellor', 'pro-chancellor', 'vice-chancellor', 'registrar'].includes(cleanRole)) {
            cleanRole = cleanRole.slice(0, -1);
        }
        cleanRole = cleanRole.replace(/[^a-z0-9]/g, ' ');
        return cleanDesig.includes(cleanRole);
    });
};

// Helper function to sync leadership flag for all employees
async function syncAllEmployeesLeadership() {
    try {
        const Employee = require('../employee/employee.model');
        const LeadershipRole = mongoose.model('LeadershipRole');
        const employees = await Employee.find({});
        
        // Dynamically get configured roleNames from DB and merge with static enum values
        const dbRolesDocs = await LeadershipRole.find({}).select('roleName');
        const dbRoles = dbRolesDocs.map(r => r.roleName).filter(Boolean);
        const staticRoles = ['Deans', 'Associate Deans', 'CoE', 'HoD', 'Chancellor', 'Pro-chancellor', 'Registrar', 'Vice-chancellor', 'Director Academics'];
        const leadershipRoles = Array.from(new Set([...staticRoles, ...dbRoles]));
        
        for (const emp of employees) {
            const targetStatus = isLeadershipDesignation(emp.designation, leadershipRoles) ? "yes" : "no";
            
            if (emp.leadership !== targetStatus) {
                // Force write the key physically to MongoDB for all documents
                await Employee.updateOne({ _id: emp._id }, { $set: { leadership: targetStatus } });
            }
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
