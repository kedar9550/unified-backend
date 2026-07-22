const Club = require('./Club.model');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Role = require('../role/role.model');
const Employee = require('../employee/employee.model');
const fs = require('fs');
const path = require('path');

// CREATE
exports.createClub = async (req, res, next) => {
    try {
        const { name, description, status, coordinators } = req.body;
        const logo = req.file;

        if (!name || !description || !logo || !coordinators) {
            if (logo) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'clubs', logo.filename));
            }
            return res.status(400).json({ message: 'Name, Description, Logo, and Coordinators are required' });
        }
        
        let parsedCoordinators = [];
        try {
            parsedCoordinators = typeof coordinators === 'string' ? JSON.parse(coordinators) : coordinators;
        } catch (error) {
            if (logo) fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'clubs', logo.filename));
            return res.status(400).json({ message: 'Invalid coordinators format' });
        }

        if (!Array.isArray(parsedCoordinators) || parsedCoordinators.length === 0) {
            if (logo) fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'clubs', logo.filename));
            return res.status(400).json({ message: 'At least one club coordinator is required' });
        }

        const logoUrl = `/uploads/clubs/${logo.filename}`;

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
            fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'clubs', logo.filename));
            return res.status(401).json({ message: 'Unauthorized. User ID not found.' });
        }

        const newClub = new Club({
            name,
            logo: logoUrl,
            description,
            status: status || 'Active',
            coordinators: parsedCoordinators,
            createdBy: userId
        });

        await newClub.save();

        // Assign Role globally in UserAppRole
        try {
            const roleDoc = await Role.findOne({ name: 'CLUB COORDINATOR' });
            if (roleDoc) {
                for (const coordinator of parsedCoordinators) {
                    const employee = await Employee.findOne({ institutionId: coordinator.employeeId });
                    if (employee) {
                        await UserAppRole.updateOne(
                            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
                            { $set: { userModel: 'Employee' } },
                            { upsert: true }
                        );
                    }
                }
            } else {
                console.warn(`Role CLUB COORDINATOR not found in DB. Roles not assigned.`);
            }
        } catch (roleError) {
            console.error('Error assigning roles:', roleError);
        }

        res.status(201).json({
            success: true,
            message: 'Club created successfully',
            club: newClub
        });
    } catch (error) {
        if (req.file) {
            const filePath = path.join(__dirname, '..', '..', 'uploads', 'clubs', req.file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        console.error('Error creating club:', error);
        next(error);
    }
};

// READ ALL
exports.getAllClubs = async (req, res, next) => {
    try {
        const clubs = await Club.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, clubs });
    } catch (error) {
        next(error);
    }
};

// READ ONE
exports.getClubById = async (req, res, next) => {
    try {
        const club = await Club.findById(req.params.id);
        if (!club) {
            return res.status(404).json({ success: false, message: 'Club not found' });
        }
        res.status(200).json({ success: true, club });
    } catch (error) {
        next(error);
    }
};

// UPDATE
exports.updateClub = async (req, res, next) => {
    try {
        const { name, description, status, coordinators } = req.body;
        const club = await Club.findById(req.params.id);

        if (!club) {
            // Cleanup uploaded file if club not found
            if (req.file) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'clubs', req.file.filename));
            }
            return res.status(404).json({ success: false, message: 'Club not found' });
        }

        let parsedCoordinators = [];
        if (coordinators) {
            try {
                parsedCoordinators = typeof coordinators === 'string' ? JSON.parse(coordinators) : coordinators;
            } catch (error) {
                if (req.file) fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'clubs', req.file.filename));
                return res.status(400).json({ message: 'Invalid coordinators format' });
            }
            
            if (!Array.isArray(parsedCoordinators) || parsedCoordinators.length === 0) {
                if (req.file) fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'clubs', req.file.filename));
                return res.status(400).json({ message: 'At least one club coordinator is required' });
            }
        }

        // Update text fields if provided
        if (name) club.name = name;
        if (description) club.description = description;
        if (status) club.status = status;
        if (coordinators) club.coordinators = parsedCoordinators;

        // Update logo if a new file was uploaded
        if (req.file) {
            // Delete old logo file
            const oldLogoPath = path.join(__dirname, '..', '..', club.logo);
            if (fs.existsSync(oldLogoPath)) {
                fs.unlinkSync(oldLogoPath);
            }
            club.logo = `/uploads/clubs/${req.file.filename}`;
        }

        await club.save();

        if (coordinators) {
            // Assign Role globally in UserAppRole
            try {
                const roleDoc = await Role.findOne({ name: 'CLUB COORDINATOR' });
                if (roleDoc) {
                    for (const coordinator of parsedCoordinators) {
                        const employee = await Employee.findOne({ institutionId: coordinator.employeeId });
                        if (employee) {
                            await UserAppRole.updateOne(
                                { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
                                { $set: { userModel: 'Employee' } },
                                { upsert: true }
                            );
                        }
                    }
                }
            } catch (roleError) {
                console.error('Error assigning roles on update:', roleError);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Club updated successfully',
            club
        });
    } catch (error) {
        if (req.file) {
            const filePath = path.join(__dirname, '..', '..', 'uploads', 'clubs', req.file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        console.error('Error updating club:', error);
        next(error);
    }
};

// DELETE
exports.deleteClub = async (req, res, next) => {
    try {
        const club = await Club.findById(req.params.id);
        if (!club) {
            return res.status(404).json({ success: false, message: 'Club not found' });
        }

        // Delete logo file from disk
        const logoPath = path.join(__dirname, '..', '..', club.logo);
        if (fs.existsSync(logoPath)) {
            fs.unlinkSync(logoPath);
        }

        await Club.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Club deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting club:', error);
        next(error);
    }
};
