const Events = require('./Events.model');
const Group = require('../EventSchools/EventSchools.model');
const fs = require('fs');
const path = require('path');
const UserAppRole = require('../userAppRole/userAppRole.model');
const Role = require('../role/role.model');
const Employee = require('../employee/employee.model');

const normalizeCoordinatorItem = (coordinator) => {
    if (!coordinator) return null;
    let parsed = coordinator;
    if (typeof coordinator === 'string') {
        try {
            parsed = JSON.parse(coordinator);
        } catch (err) {
            parsed = null;
        }
    }
    if (!parsed) return null;

    const employeeId = parsed.employeeId || parsed.institutionId || parsed.employeeCode || parsed._id || parsed.id;
    if (!employeeId) return null;

    return {
        employeeId: employeeId.toString(),
        employeeName: parsed.employeeName || parsed.name || '',
        department: parsed.department || parsed.departmentName || '',
        designation: parsed.designation || parsed.title || '',
    };
};

const normalizeCoordinators = (coordinatorsInput) => {
    if (!coordinatorsInput) return [];
    let parsed = coordinatorsInput;
    if (typeof coordinatorsInput === 'string') {
        try {
            parsed = JSON.parse(coordinatorsInput);
        } catch (err) {
            parsed = null;
        }
    }
    if (!parsed) return [];

    if (Array.isArray(parsed)) {
        return parsed.map(normalizeCoordinatorItem).filter(Boolean);
    }

    const normalized = normalizeCoordinatorItem(parsed);
    return normalized ? [normalized] : [];
};

const assignFacultyCoordinatorRole = async (coordinators) => {
    if (!Array.isArray(coordinators) || coordinators.length === 0) return;

    const roleDoc = await Role.findOne({
        $or: [
            { name: 'FACULTY COORDINATOR', app: 'UNIFIED_SYSTEM' },
            { key: 'FACULTY_COORDINATOR', app: 'UNIFIED_SYSTEM' }
        ]
    });
    if (!roleDoc) {
        console.warn('FACULTY COORDINATOR role not found in DB. Role not assigned.');
        return;
    }

    for (const coordinator of coordinators) {
        if (!coordinator || !coordinator.employeeId) continue;

        const employee = await Employee.findOne({ institutionId: coordinator.employeeId });
        if (!employee) {
            console.warn(`Employee not found for faculty coordinator ${coordinator.employeeId}`);
            continue;
        }

        await UserAppRole.updateOne(
            { userId: employee._id, app: 'UNIFIED_SYSTEM', role: roleDoc._id },
            { $set: { userModel: 'Employee' } },
            { upsert: true }
        );
    }
};

exports.createEvent = async (req, res, next) => {
    try {
        const {
            eventSchoolId,
            eventName,
            price,
            priceType,
            maxTeamSize,
            extraTeamSize,
            extraAmountPerHead,
            overview,
            rules,
            themes,
            conveners,
            venueType,
            building,
            floor,
            ground,
            roomNo,
            department,
            registrationStop,
        } = req.body;

        const bannerImage = req.file;

        if (!eventSchoolId || !eventName || !overview || !maxTeamSize) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Group, Event Name, Max Team Size, and Overview are required.' });
        }
        if (!venueType) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Venue Type is required.' });
        }
        if (venueType === 'Indoor' && (!building || !floor)) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Building and Floor are required for Indoor venues.' });
        }
        if (venueType === 'Outdoor' && !ground) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Ground is required for Outdoor venues.' });
        }
        if (venueType && !roomNo) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Room No is required.' });
        }

        const group = await Group.findById(eventSchoolId);
        if (!group) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(400).json({ message: 'Selected group does not exist.' });
        }

        const parsedRules = Array.isArray(rules) ? rules.filter((rule) => rule && rule.trim()) : [];
        const parsedThemes = Array.isArray(themes) ? themes.filter((theme) => theme && theme.trim()) : [];
        const parsedConveners = typeof conveners === 'string' ? JSON.parse(conveners || '[]') : Array.isArray(conveners) ? conveners : [];
        const parsedFacultyCoordinators = normalizeCoordinators(req.body.facultyCoordinators || req.body.facultyCoordinator);
        const parsedStudentCoordinators = typeof req.body.studentCoordinators === 'string' ? JSON.parse(req.body.studentCoordinators || '[]') : Array.isArray(req.body.studentCoordinators) ? req.body.studentCoordinators : [];

        const userId = req.user ? (req.user._id || req.user.userId) : null;
        if (!userId) {
            if (bannerImage) {
                fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', 'events', bannerImage.filename));
            }
            return res.status(401).json({ message: 'Unauthorized. User ID not found.' });
        }

        let bannerImageUrl;
        if (bannerImage) {
            bannerImageUrl = `/uploads/events/${bannerImage.filename}`;
        }

        let parsedDepartments = [];
        if (department) {
            try {
                parsedDepartments = typeof department === 'string' ? JSON.parse(department) : department;
            } catch (e) {
                parsedDepartments = [department];
            }
        }
        if (!Array.isArray(parsedDepartments)) {
            parsedDepartments = [parsedDepartments];
        }

        const newEvent = new Events({
            eventSchool: group._id,
            department: parsedDepartments,
            eventName,
            price: Number(price) || 0,
            priceType: priceType || 'Per Head',
            maxTeamSize: Number(maxTeamSize),
            venueType,
            building: building || undefined,
            floor: floor || undefined,
            ground: ground || undefined,
            roomNo: roomNo || '',
            extraTeamSize: Number(extraTeamSize) || 0,
            extraAmountPerHead: Number(extraAmountPerHead) || 0,
            overview,
            rules: parsedRules,
            themes: parsedThemes,
            bannerImage: bannerImageUrl,
            conveners: parsedConveners,
            facultyCoordinator: parsedFacultyCoordinators[0] || {},
            facultyCoordinators: parsedFacultyCoordinators,
            studentCoordinators: parsedStudentCoordinators,
            registrationStop: registrationStop || 'No',
            createdBy: userId,
        });

        await newEvent.save();

        if (parsedConveners.length > 0) {
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
        }

        if (parsedFacultyCoordinators.length > 0) {
            try {
                await assignFacultyCoordinatorRole(parsedFacultyCoordinators);
            } catch (coordRoleError) {
                console.error('Error assigning faculty coordinator role:', coordRoleError);
            }
        }

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            event: newEvent,
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
        let filterQuery = {};
        const activeRole = req.headers['active-role'];

        if (activeRole === 'EVENT_COORDINATOR' || activeRole === 'SCHOOL_COORDINATOR' || activeRole === 'FACULTY_COORDINATOR') {
            const jwt = require('jsonwebtoken');
            const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies?.token;

            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    const empId = decoded.institutionId || decoded.employeeId || decoded.employeeCode || decoded.id || decoded.userId;

                    if (empId) {
                        const empIdStr = String(empId).trim();
                        const empIdNum = Number(empIdStr);
                        const empMatch = isNaN(empIdNum) ? [empIdStr] : [empIdStr, empIdNum];

                        if (activeRole === 'SCHOOL_COORDINATOR' || activeRole === 'EVENT_COORDINATOR') {
                            const Group = require('../EventSchools/EventSchools.model');
                            const myGroups = await Group.find({
                                $or: [
                                    { 'coordinators.employeeId': { $in: empMatch } },
                                    { 'coordinator.employeeId': { $in: empMatch } }
                                ]
                            }).select('_id');
                            const myGroupIds = myGroups.map(g => g._id);

                            filterQuery = {
                                $or: [
                                    { eventSchool: { $in: myGroupIds } },
                                    { 'conveners.employeeId': { $in: empMatch } },
                                    { 'facultyCoordinators.employeeId': { $in: empMatch } },
                                    { 'facultyCoordinator.employeeId': { $in: empMatch } }
                                ]
                            };
                        } else if (activeRole === 'FACULTY_COORDINATOR') {
                            filterQuery = {
                                $or: [
                                    { 'conveners.employeeId': { $in: empMatch } },
                                    { 'facultyCoordinators.employeeId': { $in: empMatch } },
                                    { 'facultyCoordinator.employeeId': { $in: empMatch } }
                                ]
                            };
                        }
                    }
                } catch (err) {
                    console.error('Error decoding token for event filter', err);
                }
            }
        }

        const events = await Events.find(filterQuery)
            .populate('eventSchool', 'name coordinator coordinators shortName banner')
            .populate('department', 'name')
            .populate('building', 'name')
            .populate('floor', 'name')
            .populate('ground', 'name')
            .sort({ createdAt: -1 });

        const enrichedEvents = await Promise.all(events.map(async (ev) => {
            const eventObj = ev.toObject();
            if (eventObj.facultyCoordinators && eventObj.facultyCoordinators.length > 0) {
                eventObj.facultyCoordinators = await Promise.all(eventObj.facultyCoordinators.map(async (fc) => {
                    if (fc.employeeId) {
                        const emp = await Employee.findOne({ institutionId: fc.employeeId }).select('phone mobileNumber');
                        if (emp) {
                            fc.phone = emp.phone || emp.mobileNumber;
                        }
                    }
                    return fc;
                }));
            }
            if (eventObj.facultyCoordinator && eventObj.facultyCoordinator.employeeId) {
                const emp = await Employee.findOne({ institutionId: eventObj.facultyCoordinator.employeeId }).select('phone mobileNumber');
                if (emp) {
                    eventObj.facultyCoordinator.phone = emp.phone || emp.mobileNumber;
                }
            }
            return eventObj;
        }));

        res.status(200).json({ success: true, events: enrichedEvents });
    } catch (error) {
        next(error);
    }
};

exports.getEventById = async (req, res, next) => {
    try {
        const event = await Events.findById(req.params.id)
            .populate('eventSchool', 'name coordinator coordinators shortName banner')
            .populate('department', 'name')
            .populate('building', 'name')
            .populate('floor', 'name')
            .populate('ground', 'name');
        if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

        const eventObj = event.toObject();

        if (eventObj.facultyCoordinators && eventObj.facultyCoordinators.length > 0) {
            eventObj.facultyCoordinators = await Promise.all(eventObj.facultyCoordinators.map(async (fc) => {
                if (fc.employeeId) {
                    const emp = await Employee.findOne({ institutionId: fc.employeeId }).select('phone mobileNumber');
                    if (emp) {
                        fc.phone = emp.phone || emp.mobileNumber;
                    }
                }
                return fc;
            }));
        }
        if (eventObj.facultyCoordinator && eventObj.facultyCoordinator.employeeId) {
            const emp = await Employee.findOne({ institutionId: eventObj.facultyCoordinator.employeeId }).select('phone mobileNumber');
            if (emp) {
                eventObj.facultyCoordinator.phone = emp.phone || emp.mobileNumber;
            }
        }

        res.status(200).json({ success: true, event: eventObj });
    } catch (error) {
        next(error);
    }
};

const deleteFile = (filePath) => {
    if (!filePath) return;
    const absPath = path.join(__dirname, '..', '..', filePath);
    if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
    }
};

exports.updateEvent = async (req, res, next) => {
    try {
        const {
            eventSchoolId,
            eventName,
            price,
            priceType,
            maxTeamSize,
            extraTeamSize,
            extraAmountPerHead,
            overview,
            rules,
            themes,
            venueType,
            building,
            floor,
            ground,
            roomNo,
            department,
            registrationStop,
            removeBanner,
        } = req.body;

        const bannerImage = req.file;

        if (!eventSchoolId || !eventName || !overview || !maxTeamSize) {
            if (bannerImage) deleteFile(`/uploads/events/${bannerImage.filename}`);
            return res.status(400).json({ message: 'Group, Event Name, Max Team Size, and Overview are required.' });
        }
        if (!venueType) {
            if (bannerImage) deleteFile(`/uploads/events/${bannerImage.filename}`);
            return res.status(400).json({ message: 'Venue Type is required.' });
        }
        if (venueType === 'Indoor' && (!building || !floor)) {
            if (bannerImage) deleteFile(`/uploads/events/${bannerImage.filename}`);
            return res.status(400).json({ message: 'Building and Floor are required for Indoor venues.' });
        }
        if (venueType === 'Outdoor' && !ground) {
            if (bannerImage) deleteFile(`/uploads/events/${bannerImage.filename}`);
            return res.status(400).json({ message: 'Ground is required for Outdoor venues.' });
        }
        if (venueType && !roomNo) {
            if (bannerImage) deleteFile(`/uploads/events/${bannerImage.filename}`);
            return res.status(400).json({ message: 'Room No is required.' });
        }

        const group = await Group.findById(eventSchoolId);
        if (!group) {
            if (bannerImage) deleteFile(`/uploads/events/${bannerImage.filename}`);
            return res.status(400).json({ message: 'Selected group does not exist.' });
        }

        const existingEvent = await Events.findById(req.params.id);
        if (!existingEvent) {
            if (bannerImage) deleteFile(`/uploads/events/${bannerImage.filename}`);
            return res.status(404).json({ message: 'Event not found.' });
        }

        const parsedRules = Array.isArray(rules) ? rules.filter((rule) => rule && rule.trim()) : [];
        const parsedThemes = Array.isArray(themes) ? themes.filter((theme) => theme && theme.trim()) : [];
        const parsedFacultyCoordinators = normalizeCoordinators(req.body.facultyCoordinators || req.body.facultyCoordinator);
        const parsedStudentCoordinators = typeof req.body.studentCoordinators === 'string' ? JSON.parse(req.body.studentCoordinators || '[]') : Array.isArray(req.body.studentCoordinators) ? req.body.studentCoordinators : [];

        let parsedDepartments = [];
        if (department) {
            try {
                parsedDepartments = typeof department === 'string' ? JSON.parse(department) : department;
            } catch (e) {
                parsedDepartments = [department];
            }
        }
        if (!Array.isArray(parsedDepartments)) {
            parsedDepartments = [parsedDepartments];
        }

        const updatedFields = {
            eventSchool: group._id,
            department: parsedDepartments,
            eventName,
            price: Number(price) || 0,
            priceType: priceType || 'Per Head',
            maxTeamSize: Number(maxTeamSize),
            venueType,
            building: building || undefined,
            floor: floor || undefined,
            ground: ground || undefined,
            roomNo: roomNo || '',
            extraTeamSize: Number(extraTeamSize) || 0,
            extraAmountPerHead: Number(extraAmountPerHead) || 0,
            overview,
            rules: parsedRules,
            themes: parsedThemes,
            registrationStop: registrationStop || 'No',
        };

        if (bannerImage) {
            deleteFile(existingEvent.bannerImage);
            updatedFields.bannerImage = `/uploads/events/${bannerImage.filename}`;
        } else if (removeBanner === 'true') {
            deleteFile(existingEvent.bannerImage);
            updatedFields.bannerImage = null;
        }

        if (req.body.facultyCoordinators || req.body.facultyCoordinator) {
            updatedFields.facultyCoordinator = parsedFacultyCoordinators[0] || {};
            updatedFields.facultyCoordinators = parsedFacultyCoordinators;
        }

        if (req.body.studentCoordinators) {
            updatedFields.studentCoordinators = parsedStudentCoordinators;
        }

        const updatedEvent = await Events.findByIdAndUpdate(
            req.params.id,
            updatedFields,
            { new: true }
        );

        if (!updatedEvent) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        if (parsedFacultyCoordinators.length > 0) {
            try {
                await assignFacultyCoordinatorRole(parsedFacultyCoordinators);
            } catch (coordRoleError) {
                console.error('Error assigning faculty coordinator role:', coordRoleError);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Event updated successfully',
            event: updatedEvent,
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteEvent = async (req, res, next) => {
    try {
        const event = await Events.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        if (event.bannerImage) {
            const bannerPath = path.join(
                __dirname,
                '..',
                '..',
                'uploads',
                'events',
                path.basename(event.bannerImage),
            );
            if (fs.existsSync(bannerPath)) {
                fs.unlinkSync(bannerPath);
            }
        }

        await Events.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, message: 'Event deleted successfully.' });
    } catch (error) {
        next(error);
    }
};

exports.sendInvoiceMailInternal = async (data) => {
    try {
        const {
            email,
            invoiceId = 'N/A',
            invoiceDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
            eventName = 'Event',
            teamSize = 1,
            amountPaid = 0,
            participants = []
        } = data;

        const targetEmails = new Set();
        if (email) targetEmails.add(email);
        participants.forEach(p => {
            if (p.email) targetEmails.add(p.email);
        });

        if (targetEmails.size === 0) {
            throw new Error('No emails provided');
        }

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: 'smtp.office365.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const participantsHtml = participants.length > 0
            ? participants.map((p, index) => {
                const collegeDisplay = p.college === 'Other College' && p.otherCollege ? p.otherCollege : (p.college || 'Aditya University');
                return `
                <tr ${index < participants.length - 1 ? 'style="border-bottom: 1px solid #e0e0e0;"' : ''}>
                    <td style="padding: 10px; border: 1px solid #e0e0e0;">${index + 1}</td>
                    <td style="padding: 10px; border: 1px solid #e0e0e0;">${p.name || '-'}</td>
                    <td style="padding: 10px; border: 1px solid #e0e0e0;">${p.roll || p.email || '-'}</td>
                    <td style="padding: 10px; border: 1px solid #e0e0e0;">${collegeDisplay}</td>
                </tr>
            `}).join('')
            : `
                <tr>
                    <td colspan="4" style="padding: 10px; border: 1px solid #e0e0e0; text-align: center;">No participant details provided</td>
                </tr>
            `;

        const htmlContent = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 1000px; margin: 0 auto; background-color: #f4f6f9; padding: 20px;">
                <!-- Header -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #001a4d; border-radius: 8px 8px 0 0;">
                    <tr>
                        <td style="padding: 20px;">
                            <img src="cid:aditya_logo" alt="Logo" style="height: 50px; vertical-align: middle; margin-right: 15px;" />
                        </td>
                        <td align="right" style="padding: 20px;">
                            <div style="background-color: #ffcc00; color: #001a4d; padding: 8px 20px; font-weight: bold; font-size: 16px; display: inline-block; position: relative;">
                                INVOICE CONFIRMATION
                            </div>
                        </td>
                    </tr>
                </table>

                <!-- Main Content container -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 0 0 8px 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <tr>
                        <!-- Left Column -->
                        <td width="45%" valign="top" style="padding: 30px;">
                            <h2 style="color: #001a4d; font-size: 22px; margin-top: 0;">Dear Student,</h2>
                            <p style="color: #333; line-height: 1.6; font-size: 15px;">Thank you for registering for the event. Your payment has been successfully received.</p>
                            <p style="color: #333; line-height: 1.6; font-size: 15px;">Please find your invoice details along with the participant information below.</p>
                            
                            <div style="margin-top: 30px; margin-bottom: 15px;">
                                <h3 style="color: #001a4d; font-size: 16px; margin: 0; display: inline-block; vertical-align: middle;">
                                    <div style="width: 20px; height: 22px; border: 1px solid #ccc; border-radius: 3px; background: white; text-align: center; overflow: hidden; display: inline-block; vertical-align: middle; margin-right: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                                        <div style="background-color: #e53935; color: white; font-size: 6px; font-weight: bold; padding: 1px 0; line-height: 1;">AUG</div>
                                        <div style="color: #333; font-size: 10px; font-weight: bold; line-height: 1.2;">17</div>
                                    </div>
                                    REGISTRATION SUMMARY
                                </h3>
                            </div>
                            
                            <!-- 3 Cards -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td width="31%" align="center" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px 5px;">
                                        <div style="background-color: #1a73e8; width: 40px; height: 40px; border-radius: 50%; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center;">
                                            <div style="width: 18px; height: 20px; border: 1px solid #fff; border-radius: 3px; background: white; text-align: center; overflow: hidden; display: inline-block; margin-top: 9px;">
                                                <div style="background-color: #e53935; color: white; font-size: 5px; font-weight: bold; padding: 1px 0; line-height: 1;">AUG</div>
                                                <div style="color: #333; font-size: 9px; font-weight: bold; line-height: 1.2;">17</div>
                                            </div>
                                        </div>
                                        <div style="font-size: 24px; font-weight: bold; color: #001a4d; margin-bottom: 5px;">1</div>
                                        <div style="font-size: 12px; color: #666;">Events Registered</div>
                                    </td>
                                    <td width="3%"></td>
                                    <td width="31%" align="center" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px 5px;">
                                        <div style="background-color: #0f9d58; color: white; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; font-size: 20px; margin: 0 auto 10px;">₹</div>
                                        <div style="font-size: 24px; font-weight: bold; color: #001a4d; margin-bottom: 5px;">₹${amountPaid}</div>
                                        <div style="font-size: 12px; color: #666;">Total Amount Paid</div>
                                    </td>
                                    <td width="3%"></td>
                                    <td width="32%" align="center" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px 5px;">
                                        <div style="background-color: #e8f0fe; color: #1a73e8; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; font-size: 20px; margin: 0 auto 10px;">📅</div>
                                        <div style="font-size: 13px; font-weight: bold; color: #001a4d; margin-bottom: 5px; white-space: nowrap;">11 - 12 SEP, 2026</div>
                                        <div style="font-size: 12px; color: #666;">Event Date</div>
                                    </td>
                                </tr>
                            </table>

                            <div style="background-color: #e6f4ea; border: 1px solid #ceead6; border-radius: 8px; padding: 15px; margin-top: 30px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td width="40" valign="top">
                                            <div style="background-color: #0f9d58; color: white; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-weight: bold;">✓</div>
                                        </td>
                                        <td>
                                            <div style="color: #0f9d58; font-weight: bold; font-size: 16px; margin-bottom: 5px;">Payment Successful!</div>
                                            <div style="color: #137333; font-size: 14px;">Your payment has been confirmed and your registration is complete.</div>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <p style="color: #001a4d; font-size: 15px; margin-top: 30px;">We look forward to your active participation in the event.</p>
                            <p style="color: #001a4d; font-size: 15px; font-weight: bold;">Thank you!</p>
                            <p style="color: #333; font-size: 15px; line-height: 1.6; margin-top: 20px;">
                                Best Regards,<br/>
                                <strong style="color: #001a4d;">VEDA 2k26 Organizing Team</strong><br/>
                                Aditya University
                            </p>
                        </td>

                        <!-- Right Column (Invoice Box) -->
                        <td width="55%" valign="top" style="padding: 30px;">
                            <div style="border: 1px solid #e0e0e0; border-radius: 12px; padding: 25px; background-color: #ffffff;">
                                <div style="text-align: center; margin-top: -40px; margin-bottom: 20px;">
                                    <span style="background-color: #001a4d; color: white; padding: 10px 40px; border-radius: 20px; font-weight: bold; font-size: 18px; display: inline-block;">INVOICE</span>
                                </div>
                                
                                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                                    <tr>
                                        <td width="50%" style="font-size: 14px; color: #666;">Invoice ID<br/><strong style="color: #333; font-size: 16px;">${invoiceId}</strong></td>
                                        <td width="50%" align="right" style="font-size: 14px; color: #666;">Invoice Date<br/><strong style="color: #333; font-size: 16px;">${invoiceDate}</strong></td>
                                    </tr>
                                </table>
                                <hr style="border: none; border-top: 1px solid #e0e0e0; margin-bottom: 20px;" />

                                <h3 style="color: #001a4d; font-size: 16px; margin: 0 0 15px 0; display: flex; align-items: center;">
                                    <div style="width: 20px; height: 22px; border: 1px solid #ccc; border-radius: 3px; background: white; text-align: center; overflow: hidden; display: inline-block; margin-right: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                                        <div style="background-color: #e53935; color: white; font-size: 6px; font-weight: bold; padding: 1px 0; line-height: 1;">AUG</div>
                                        <div style="color: #333; font-size: 10px; font-weight: bold; line-height: 1.2;">17</div>
                                    </div>
                                    EVENT DETAILS
                                </h3>
                                <table width="100%" cellpadding="12" cellspacing="0" style="border: 1px solid #e0e0e0; border-radius: 8px;">
                                    <tr>
                                        <td width="50%" style="border-right: 1px solid #e0e0e0; font-size: 14px; color: #666;">Event Name<br/><strong style="color: #001a4d; font-size: 16px;">${eventName}</strong></td>
                                        <td width="50%" style="font-size: 14px; color: #666;">Team Size<br/><strong style="color: #001a4d; font-size: 16px;">${teamSize}</strong></td>
                                    </tr>
                                </table>

                                <h3 style="color: #001a4d; font-size: 16px; margin: 25px 0 15px 0;">👥 PARTICIPANT DETAILS (${participants.length || teamSize})</h3>
                                <table width="100%" cellpadding="10" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                                    <thead style="background-color: #001a4d; color: white; font-size: 13px; text-align: left;">
                                        <tr>
                                            <th style="padding: 10px; border: 1px solid #e0e0e0;">#</th>
                                            <th style="padding: 10px; border: 1px solid #e0e0e0;">Name</th>
                                            <th style="padding: 10px; border: 1px solid #e0e0e0;">Roll No</th>
                                            <th style="padding: 10px; border: 1px solid #e0e0e0;">College</th>
                                        </tr>
                                    </thead>
                                    <tbody style="font-size: 14px; color: #333;">
                                        ${participantsHtml}
                                    </tbody>
                                </table>

                                <h3 style="color: #001a4d; font-size: 16px; margin: 25px 0 15px 0;">₹ PAYMENT DETAILS</h3>
                                <table width="100%" cellpadding="10" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                                    <thead style="background-color: #001a4d; color: white; font-size: 13px; text-align: left;">
                                        <tr>
                                            <th style="padding: 10px; border: 1px solid #e0e0e0;">Date</th>
                                            <th style="padding: 10px; border: 1px solid #e0e0e0;">Event Name</th>
                                            <th style="padding: 10px; border: 1px solid #e0e0e0;">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody style="font-size: 14px; color: #333;">
                                        <tr>
                                            <td style="padding: 10px; border: 1px solid #e0e0e0;">${invoiceDate}</td>
                                            <td style="padding: 10px; border: 1px solid #e0e0e0;">${eventName}</td>
                                            <td style="padding: 10px; border: 1px solid #e0e0e0; color: #0f9d58; font-weight: bold;">₹${amountPaid}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                <div style="background-color: #fff8e1; border-radius: 8px; padding: 15px 20px; margin-top: 20px; display: table; width: 100%; box-sizing: border-box;">
                                    <div style="display: table-cell; vertical-align: middle; font-weight: bold; color: #001a4d; font-size: 15px;">TOTAL AMOUNT PAID</div>
                                    <div style="display: table-cell; vertical-align: middle; text-align: right; font-weight: bold; color: #0f9d58; font-size: 24px;">₹${amountPaid}</div>
                                </div>

                                <div style="background-color: #e8f0fe; border-radius: 8px; padding: 15px; margin-top: 20px;">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td width="40" valign="middle">
                                                <div style="border: 1px solid #1a73e8; border-radius: 50%; width: 30px; height: 30px; text-align: center; line-height: 30px; color: #1a73e8; font-size: 16px;">✉️</div>
                                            </td>
                                            <td style="color: #001a4d; font-size: 14px; line-height: 1.4;">
                                                This is a system generated invoice.<br/>
                                                Please keep it for your records.
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                            </div>
                        </td>
                    </tr>
                </table>

                <!-- Footer -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #001a4d; border-radius: 8px; margin-top: 10px;">
                    <tr>
                        <td align="center" style="padding: 15px; color: #ffcc00; font-size: 14px;">
                            📞 +91 99999 99999 &nbsp;&nbsp;|&nbsp;&nbsp; ✉️ veda@adityauniversity.edu.in &nbsp;&nbsp;|&nbsp;&nbsp; 🌐 www.adityauniversity.edu.in
                        </td>
                    </tr>
                </table>
            </div>
        `;

        const path = require('path');
        const fs = require('fs');
        const logoPath = path.resolve(__dirname, '../../assets/Aditya University Gold Logo.png');

        let mailAttachments = [];
        if (fs.existsSync(logoPath)) {
            mailAttachments.push({
                filename: 'Aditya University Gold Logo.png',
                path: logoPath,
                cid: 'aditya_logo'
            });
        }



        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: Array.from(targetEmails).join(','),
            subject: 'Invoice Confirmation - VEDA 2k26',
            html: htmlContent,
            attachments: mailAttachments
        };

        await transporter.sendMail(mailOptions);
        return { success: true, message: 'Invoice sent successfully' };
    } catch (error) {
        console.error('Error sending invoice email internally:', error);
        throw error;
    }
};

exports.sendInvoiceMail = async (req, res, next) => {
    try {
        await exports.sendInvoiceMailInternal(req.body);
        res.status(200).json({ success: true, message: 'Invoice sent successfully' });
    } catch (error) {
        console.error('Error sending invoice email route:', error);
        res.status(500).json({ success: false, message: 'Failed to send invoice email' });
    }
};
