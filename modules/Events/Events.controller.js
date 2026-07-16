const Events = require('./Events.model');
const fs = require('fs');
const path = require('path');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Role = require('../role/role.model');
const Employee = require('../employee/employee.model');

exports.createEvent = async (req, res, next) => {
    try {
        const { eventName, conveners } = req.body;
        const bannerImage = req.file;

        if (!eventName || !conveners || !bannerImage) {
            // Cleanup the uploaded file if validation fails
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Event Name, Conveners, and Banner Image are required' });
        }

        let parsedConveners = [];
        try {
            parsedConveners = JSON.parse(conveners);
        } catch (error) {
            fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            return res.status(400).json({ message: 'Invalid conveners format' });
        }

        if (!Array.isArray(parsedConveners) || parsedConveners.length === 0) {
            fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            return res.status(400).json({ message: 'At least one convener is required' });
        }

        // Construct the URL path for the image
        // Assuming static files are served from /uploads
        const bannerImageUrl = `/uploads/events/${bannerImage.filename}`;

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
             fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
             return res.status(401).json({ message: 'Unauthorized. User ID not found.' });
        }

        const newEvent = new Events({
            eventName,
            bannerImage: bannerImageUrl,
            conveners: parsedConveners,
            createdBy: userId
        });

        await newEvent.save();

        // Assign CONVENER role to all conveners
        try {
            const roleDoc = await Role.findOne({ name: 'CONVENER' });
            if (roleDoc) {
                for (const convener of parsedConveners) {
                    const employee = await Employee.findOne({ institutionId: convener.employeeId });
                    if (employee) {
                        await UserAppRole.updateOne(
                            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
                            { $set: { userModel: 'Employee' } },
                            { upsert: true }
                        );
                    }
                }
            } else {
                console.warn('CONVENER role not found in DB. Roles not assigned.');
            }
        } catch (roleError) {
            console.error('Error assigning roles to conveners:', roleError);
        }

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            event: newEvent
        });
    } catch (error) {
        if (req.file) {
            const filePath = path.join(__dirname, '..', '..', 'uploads', 'events', req.file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        console.error('Error creating event:', error);
        next(error);
    }
};

exports.getAllEvents = async (req, res, next) => {
    try {
        const events = await Events.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, events });
    } catch (error) {
        next(error);
    }
};
