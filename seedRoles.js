const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.UnifiedDb).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

const RoleSchema = new mongoose.Schema({
    name: { type: String, required: true, uppercase: true },
    key: { type: String, required: true, uppercase: true, unique: true },
    defaultRole: { type: Boolean, required: true, default: false },
    app: { type: String, required: true, default: 'UNIFIED_SYSTEM' },
    description: { type: String }
}, { timestamps: true });

// Prevent overwrite model error
const Role = mongoose.models.Role || mongoose.model('Role', RoleSchema);

const newRoles = [
    { name: 'PRO VICE-CHANCELLOR (E & S)', key: 'PRO_VICE_CHANCELLOR_E_S', description: 'Pro Vice-Chancellor for Engineering & Sciences' },
    { name: 'PRO VICE-CHANCELLOR (A)', key: 'PRO_VICE_CHANCELLOR_A', description: 'Pro Vice-Chancellor for Academics' },
    { name: 'PRO VICE-CHANCELLOR (S & P)', key: 'PRO_VICE_CHANCELLOR_S_P', description: 'Pro Vice-Chancellor for Strategy & Planning' },
    { name: 'VICE CHANCELLOR', key: 'VICE_CHANCELLOR', description: 'Vice Chancellor' },
    { name: 'DY. PRO CHANCELLOR', key: 'DY_PRO_CHANCELLOR', description: 'Deputy Pro Chancellor' },
    { name: 'REGISTRAR', key: 'REGISTRAR', description: 'Registrar' },
    { name: 'DEAN - (IQAC)', key: 'DEAN_IQAC', description: 'Dean of IQAC' },
    { name: 'DEAN - (ADMISSIONS)', key: 'DEAN_ADMISSIONS', description: 'Dean of Admissions' }
];

async function seedRoles() {
    try {
        for (const roleData of newRoles) {
            const existingRole = await Role.findOne({ key: roleData.key });
            if (!existingRole) {
                await Role.create(roleData);
                console.log(`Created role: ${roleData.key}`);
            } else {
                console.log(`Role already exists: ${roleData.key}`);
            }
        }
        console.log('Role seeding completed.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding roles:', error);
        process.exit(1);
    }
}

seedRoles();
