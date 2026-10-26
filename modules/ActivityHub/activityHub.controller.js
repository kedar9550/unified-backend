const mongoose = require('mongoose');
const ActivityHubActivity = require('./activityHub.model');
const ActivityHubRegistration = require('./activityHubRegistration.model');
const Employee = require('../employee/employee.model');
const Student = require('../StudentData/Studentdata.model');
const Department = require('../academics/department.model');
const AcademicYear = require('../academicYear/academicYear.model');
const ExcelJS = require('exceljs');
const { fetchStudentFromEcap } = require('../../utils/ecapService');

/**
 * Role & Privilege Helper
 */
const getUserPrivilege = (user) => {
  if (!user || !user.roles) return { isAdmin: false, isHOD: false, roleNames: [] };

  const roleNames = user.roles.flatMap(r => {
    const roleName = (r.role?.name || '').toUpperCase().trim();
    const roleKey = (r.role?.key || '').toUpperCase().trim();
    const roleDirect = (typeof r === 'string' ? r : (typeof r.role === 'string' ? r.role : '')).toUpperCase().trim();
    return [roleName, roleKey, roleDirect].filter(Boolean);
  });

  const adminRoles = ['SUPER_ADMIN', 'UNIPRIME', 'GLOBAL_EVENT_ADMIN', 'ADMIN', 'MANAGEMENT'];
  const hodRoles = ['HOD', 'DEPARTMENT HOD', 'SCHOOL_DEAN', 'SCHOOL DEAN', 'PRINCIPAL', 'VICE_CHANCELLOR'];

  const isAdmin = roleNames.some(role => adminRoles.includes(role));
  const isHOD = roleNames.some(role => hodRoles.includes(role));

  return { isAdmin, isHOD, roleNames };
};

// ==========================================
// 1. FACULTY & ADMIN: ACTIVITY MANAGEMENT
// ==========================================

/**
 * Create a new Activity (Default: isEnabled = false)
 * Separate workflow: No student participants added at creation.
 */
exports.createActivity = async (req, res) => {
  try {
    const {
      title,
      activityType,
      academicYear,
      academicYearName,
      department,
      departmentName,
      startDate,
      endDate,
      registrationDeadline,
      description,
      maxParticipants,
      typeDetails
    } = req.body;

    if (!title || !activityType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Title, Activity Type, Start Date, and End Date are mandatory fields.'
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be on or after Start date.'
      });
    }

    const userId = req.user?.userId || req.user?._id || req.user?.id;
    let emp = null;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      emp = await Employee.findById(userId).populate('department');
    }
    const createdByName = emp?.name || 'Faculty Member';
    const createdByEmail = emp?.email || '';
    const createdByEmpId = emp?.institutionId || '';
    const creatorDepartment = emp?.department?.name || departmentName || '';

    // Resolve academic year name if not provided
    const validAcademicYear = (academicYear && mongoose.Types.ObjectId.isValid(academicYear)) ? academicYear : null;
    let finalAyName = academicYearName || '';
    if (!finalAyName && validAcademicYear) {
      const ayDoc = await AcademicYear.findById(validAcademicYear);
      if (ayDoc) finalAyName = ayDoc.year || ayDoc.academicYear || ayDoc.name || '';
    }

    // Resolve department name if not provided
    const validDepartment = (department && mongoose.Types.ObjectId.isValid(department)) ? department : null;
    let finalDeptName = departmentName || creatorDepartment;
    if (!finalDeptName && validDepartment) {
      const deptDoc = await Department.findById(validDepartment);
      if (deptDoc) finalDeptName = deptDoc.name;
    }

    // CRITICAL: Newly created activities default to isEnabled = false (Draft)
    const newActivity = new ActivityHubActivity({
      title: title.trim(),
      activityType,
      academicYear: validAcademicYear,
      academicYearName: finalAyName,
      department: validDepartment || emp?.department?._id || null,
      departmentName: finalDeptName,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : new Date(endDate),
      description: description ? description.trim() : '',
      maxParticipants: Number(maxParticipants) || 0,
      typeDetails: typeDetails || {},
      isEnabled: false, // Strictly disabled on creation
      status: 'Draft',
      registrationCount: 0,
      createdBy: (userId && mongoose.Types.ObjectId.isValid(userId)) ? userId : new mongoose.Types.ObjectId(),
      createdByName,
      createdByEmail,
      createdByEmpId,
      creatorDepartment
    });

    const saved = await newActivity.save();

    return res.status(201).json({
      success: true,
      message: 'Activity created successfully (Saved as disabled draft).',
      data: saved
    });
  } catch (error) {
    console.error('Error creating Activity Hub activity:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create activity',
      error: error.message
    });
  }
};

/**
 * List Activities for Faculty/Admin (with filters, search, and scoping)
 */
exports.getActivities = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      activityType,
      academicYear,
      department,
      isEnabled,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const { isAdmin, isHOD } = getUserPrivilege(req.user);
    const userId = req.user?.userId || req.user?._id;

    const query = {};

    // Role-based scoping:
    // SuperAdmin / GlobalEventAdmin: sees all activities
    // HOD: sees department activities
    // Faculty: sees activities created by themselves
    if (!isAdmin) {
      if (isHOD && req.user.hodDepartments && req.user.hodDepartments.length > 0) {
        query.$or = [
          { createdBy: userId },
          { department: { $in: req.user.hodDepartments } }
        ];
      } else {
        query.createdBy = userId;
      }
    }

    if (activityType && activityType !== 'All') {
      query.activityType = activityType;
    }

    if (academicYear && academicYear !== 'All') {
      query.$or = query.$or || [];
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { academicYearName: academicYear },
          { academicYear: mongoose.Types.ObjectId.isValid(academicYear) ? academicYear : null }
        ]
      });
    }

    if (department && department !== 'All') {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { departmentName: department },
          { department: mongoose.Types.ObjectId.isValid(department) ? department : null }
        ]
      });
    }

    if (isEnabled !== undefined && isEnabled !== '' && isEnabled !== 'All') {
      query.isEnabled = String(isEnabled) === 'true';
    }

    if (startDate) {
      query.startDate = { $gte: new Date(startDate) };
    }
    if (endDate) {
      query.endDate = { ...(query.endDate || {}), $lte: new Date(endDate) };
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { title: searchRegex },
          { description: searchRegex },
          { createdByName: searchRegex },
          { departmentName: searchRegex },
          { academicYearName: searchRegex }
        ]
      });
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [activities, total] = await Promise.all([
      ActivityHubActivity.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ActivityHubActivity.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: activities,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('Error fetching Activity Hub activities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve activities',
      error: error.message
    });
  }
};

/**
 * Get Activity by ID
 */
exports.getActivityById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid activity ID' });
    }

    const activity = await ActivityHubActivity.findById(id).lean();
    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    return res.status(200).json({ success: true, data: activity });
  } catch (error) {
    console.error('Error getting activity by ID:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving activity', error: error.message });
  }
};

/**
 * Update Activity details (Faculty / Admin)
 */
exports.updateActivity = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid activity ID' });
    }

    const activity = await ActivityHubActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    const { isAdmin } = getUserPrivilege(req.user);
    const userId = req.user?.userId || req.user?._id;
    const isOwner = activity.createdBy.toString() === userId.toString();

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to edit this activity.'
      });
    }

    const {
      title,
      activityType,
      academicYear,
      academicYearName,
      department,
      departmentName,
      startDate,
      endDate,
      registrationDeadline,
      description,
      maxParticipants,
      typeDetails
    } = req.body;

    if (title) activity.title = title.trim();
    if (activityType) activity.activityType = activityType;

    if (academicYear !== undefined) {
      activity.academicYear = (academicYear && mongoose.Types.ObjectId.isValid(academicYear)) ? academicYear : null;
      if (!academicYearName && activity.academicYear) {
        const ayDoc = await AcademicYear.findById(activity.academicYear);
        if (ayDoc) activity.academicYearName = ayDoc.year || ayDoc.academicYear || ayDoc.name || '';
      }
    }
    if (academicYearName !== undefined) activity.academicYearName = academicYearName;

    if (department !== undefined) {
      activity.department = (department && mongoose.Types.ObjectId.isValid(department)) ? department : null;
    }
    if (departmentName !== undefined) activity.departmentName = departmentName;

    if (startDate) activity.startDate = new Date(startDate);
    if (endDate) activity.endDate = new Date(endDate);
    if (registrationDeadline !== undefined) {
      activity.registrationDeadline = registrationDeadline ? new Date(registrationDeadline) : activity.endDate;
    }
    if (description !== undefined) activity.description = description ? description.trim() : '';
    if (maxParticipants !== undefined) activity.maxParticipants = Number(maxParticipants) || 0;
    if (typeDetails !== undefined) activity.typeDetails = typeDetails;

    const saved = await activity.save();

    return res.status(200).json({
      success: true,
      message: 'Activity updated successfully.',
      data: saved
    });
  } catch (error) {
    console.error('Error updating activity:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update activity',
      error: error.message
    });
  }
};

/**
 * CRITICAL REQUIREMENT: Toggle Enable / Disable Status
 * Disabling immediately halts registrations and hides from Student Portal.
 * Does NOT delete the activity or its registrations.
 */
exports.toggleActivityStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid activity ID' });
    }

    const activity = await ActivityHubActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    const { isAdmin } = getUserPrivilege(req.user);
    const userId = req.user?.userId || req.user?._id;
    const isOwner = activity.createdBy.toString() === userId.toString();

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to change the status of this activity.'
      });
    }

    // Toggle status
    activity.isEnabled = !activity.isEnabled;
    activity.status = activity.isEnabled ? 'Published' : 'Draft';

    await activity.save();

    return res.status(200).json({
      success: true,
      message: activity.isEnabled
        ? 'Activity is now ENABLED and visible to eligible students.'
        : 'Activity is now DISABLED and hidden from student registration.',
      data: {
        _id: activity._id,
        isEnabled: activity.isEnabled,
        status: activity.status
      }
    });
  } catch (error) {
    console.error('Error toggling activity status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change activity status',
      error: error.message
    });
  }
};

/**
 * Activity Hub Dashboard KPI Statistics
 */
exports.getStats = async (req, res) => {
  try {
    const { isAdmin, isHOD } = getUserPrivilege(req.user);
    const userId = req.user?.userId || req.user?._id;

    const baseQuery = {};
    if (!isAdmin) {
      if (isHOD && req.user.hodDepartments && req.user.hodDepartments.length > 0) {
        baseQuery.$or = [
          { createdBy: userId },
          { department: { $in: req.user.hodDepartments } }
        ];
      } else {
        baseQuery.createdBy = userId;
      }
    }

    const [total, enabled, disabled, totalRegistrations] = await Promise.all([
      ActivityHubActivity.countDocuments(baseQuery),
      ActivityHubActivity.countDocuments({ ...baseQuery, isEnabled: true }),
      ActivityHubActivity.countDocuments({ ...baseQuery, isEnabled: false }),
      ActivityHubRegistration.countDocuments(
        isAdmin ? {} : { activity: { $in: await ActivityHubActivity.find(baseQuery).distinct('_id') } }
      )
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        enabled,
        disabled,
        totalRegistrations
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
      error: error.message
    });
  }
};

// ==========================================
// 2. REGISTRATIONS MANAGEMENT & EXPORT
// ==========================================

/**
 * Get Registrations for Activities (Faculty / Admin)
 * Filterable by activityId, student search, department
 */
exports.getActivityRegistrations = async (req, res) => {
  try {
    const {
      activityId,
      page = 1,
      limit = 20,
      search = '',
      department,
      status
    } = req.query;

    const { isAdmin, isHOD } = getUserPrivilege(req.user);
    const userId = req.user?.userId || req.user?._id;

    const query = {};

    // Scope check: Ensure user is authorized to view registrations for this activity
    if (activityId) {
      if (!mongoose.Types.ObjectId.isValid(activityId)) {
        return res.status(400).json({ success: false, message: 'Invalid activity ID' });
      }

      if (!isAdmin) {
        const act = await ActivityHubActivity.findById(activityId);
        if (!act) return res.status(404).json({ success: false, message: 'Activity not found' });

        const isOwner = act.createdBy.toString() === userId.toString();
        const isDeptHOD = isHOD && req.user.hodDepartments?.some(d => d.toString() === act.department?.toString());
        if (!isOwner && !isDeptHOD) {
          return res.status(403).json({ success: false, message: 'Not authorized to view registrations for this activity.' });
        }
      }
      query.activity = activityId;
    } else if (!isAdmin) {
      // If no specific activity provided, scope to activities owned by user
      const userActivityIds = await ActivityHubActivity.find({ createdBy: userId }).distinct('_id');
      query.activity = { $in: userActivityIds };
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (department && department !== 'All') {
      query.department = new RegExp(department.trim(), 'i');
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { rollNumber: searchRegex },
        { studentName: searchRegex },
        { email: searchRegex },
        { department: searchRegex },
        { branch: searchRegex }
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [registrations, total] = await Promise.all([
      ActivityHubRegistration.find(query)
        .populate('activity', 'title activityType startDate endDate isEnabled departmentName')
        .sort({ registeredAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ActivityHubRegistration.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: registrations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('Error fetching activity registrations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve registrations',
      error: error.message
    });
  }
};

/**
 * Export Registrations to Excel (.xlsx) using ExcelJS
 */
exports.exportActivityRegistrations = async (req, res) => {
  try {
    const { activityId } = req.query;
    const query = {};

    let activityTitle = 'All_Activities';
    if (activityId) {
      if (!mongoose.Types.ObjectId.isValid(activityId)) {
        return res.status(400).json({ success: false, message: 'Invalid activity ID' });
      }
      const act = await ActivityHubActivity.findById(activityId);
      if (act) {
        activityTitle = act.title.replace(/[^a-zA-Z0-9_-]/g, '_');
      }
      query.activity = activityId;
    }

    const registrations = await ActivityHubRegistration.find(query)
      .populate('activity', 'title activityType startDate endDate departmentName academicYearName')
      .sort({ registeredAt: -1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Aditya University Activity Hub';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Registrations');

    // Title Block
    worksheet.mergeCells('A1:I1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `ACTIVITY HUB REGISTRATIONS — ${activityTitle.replace(/_/g, ' ')}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF004E92' }
    };
    worksheet.getRow(1).height = 36;

    // Header Row
    const headers = [
      'S.No',
      'Roll Number',
      'Student Name',
      'Department / Branch',
      'Semester',
      'Activity Title',
      'Activity Type',
      'Registered Date & Time',
      'Status'
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Populate Data Rows
    registrations.forEach((reg, idx) => {
      const row = worksheet.addRow([
        idx + 1,
        reg.rollNumber || '-',
        reg.studentName || '-',
        reg.department || reg.branch || '-',
        reg.semester || '-',
        reg.activity?.title || '-',
        reg.activity?.activityType || '-',
        reg.registeredAt ? new Date(reg.registeredAt).toLocaleString('en-IN') : '-',
        reg.status || 'Registered'
      ]);

      row.height = 20;
      row.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 || colNumber === 2 || colNumber === 5 ? 'center' : 'left' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });
    });

    // Auto-fit column widths
    worksheet.columns = [
      { width: 8 },  // S.No
      { width: 18 }, // Roll Number
      { width: 28 }, // Student Name
      { width: 22 }, // Dept / Branch
      { width: 12 }, // Semester
      { width: 34 }, // Title
      { width: 22 }, // Type
      { width: 24 }, // Registered At
      { width: 16 }  // Status
    ];

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=ActivityHub_Registrations_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('Error exporting registrations to Excel:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export registrations',
      error: error.message
    });
  }
};

// ==========================================
// 3. STUDENT PORTAL: ENROLMENT & WORKFLOWS
// ==========================================

/**
 * List Enabled, Active Activities for Logged-In Student
 * CRITICAL RULE: Backend enforces isEnabled === true and scheduling window.
 * Disabled activities NEVER appear in this response.
 */
exports.getStudentActivities = async (req, res) => {
  try {
    const studentId = req.user?.userId;
    const rollNo = req.user?.institutionId ? req.user.institutionId.toUpperCase() : '';

    const now = new Date();

    // Query ONLY activities that are explicitly enabled and not past end date
    const query = {
      isEnabled: true,
      endDate: { $gte: new Date(now.setHours(0, 0, 0, 0)) }
    };

    const activities = await ActivityHubActivity.find(query)
      .sort({ startDate: 1 })
      .lean();

    // Fetch this student's registrations to mark 'isRegistered'
    const myRegistrations = await ActivityHubRegistration.find({
      $or: [
        { student: studentId },
        { rollNumber: rollNo }
      ]
    }).lean();

    const registeredMap = new Map();
    myRegistrations.forEach(r => {
      registeredMap.set(r.activity.toString(), r);
    });

    // Enrich activities with student's registration status
    const enriched = activities.map(act => {
      const reg = registeredMap.get(act._id.toString());
      const isPastDeadline = act.registrationDeadline ? new Date() > new Date(act.registrationDeadline) : false;
      const isFull = act.maxParticipants > 0 && (act.registrationCount || 0) >= act.maxParticipants;

      return {
        ...act,
        isRegistered: Boolean(reg),
        registrationDetails: reg || null,
        isRegistrationOpen: !isPastDeadline && !isFull && act.isEnabled
      };
    });

    return res.status(200).json({
      success: true,
      data: enriched
    });
  } catch (error) {
    console.error('Error fetching student activities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve activities',
      error: error.message
    });
  }
};

/**
 * Self-Service Student Registration
 * CRITICAL VALIDATIONS:
 * 1. Activity existence and isEnabled === true.
 * 2. Current date within registration window.
 * 3. Duplicate prevention via DB unique index and pre-check.
 * 4. Identity derived from req.user (no arbitrary frontend identity trusted).
 */
exports.registerStudentForActivity = async (req, res) => {
  try {
    const { activityId } = req.body;
    if (!activityId || !mongoose.Types.ObjectId.isValid(activityId)) {
      return res.status(400).json({ success: false, message: 'Valid Activity ID is required' });
    }

    const studentId = req.user?.userId;
    const cleanRoll = String(req.user?.institutionId || '').toUpperCase().trim();

    if (!studentId || !cleanRoll) {
      return res.status(401).json({ success: false, message: 'Authenticated student identification missing.' });
    }

    // 1. Validate Activity Existence & Enabled Status
    const activity = await ActivityHubActivity.findById(activityId);
    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found.' });
    }

    if (!activity.isEnabled) {
      return res.status(400).json({
        success: false,
        message: 'This activity is currently disabled and not accepting registrations.'
      });
    }

    // 2. Validate Registration Deadline & End Date
    const now = new Date();
    const deadline = activity.registrationDeadline ? new Date(activity.registrationDeadline) : new Date(activity.endDate);
    if (now > deadline) {
      return res.status(400).json({
        success: false,
        message: 'Registration deadline for this activity has passed.'
      });
    }

    // 3. Validate Capacity
    if (activity.maxParticipants > 0 && activity.registrationCount >= activity.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'This activity has reached maximum registration capacity.'
      });
    }

    // 4. Duplicate Check (Application layer check before DB unique constraint)
    const existingRegistration = await ActivityHubRegistration.findOne({
      activity: activity._id,
      $or: [
        { student: studentId },
        { rollNumber: cleanRoll }
      ]
    });

    if (existingRegistration) {
      return res.status(400).json({
        success: false,
        message: 'You have already registered for this activity.'
      });
    }

    // 5. Gather Student Academic Profile (DB + ECAP)
    let studentName = req.user?.name || '';
    let studentDept = '';
    let studentBranch = '';
    let studentSem = null;
    let studentEmail = req.user?.email || '';
    let studentPhone = '';

    // Check local student document
    const studentDoc = await Student.findById(studentId).populate('academicInfo.department');
    if (studentDoc) {
      studentName = studentDoc.personalInfo?.studentName || studentName;
      studentDept = studentDoc.academicInfo?.department?.name || studentDoc.academicInfo?.branch || '';
      studentBranch = studentDoc.academicInfo?.branch || '';
      studentSem = studentDoc.academicInfo?.semester || null;
      studentEmail = studentDoc.contactInfo?.emailId || studentEmail;
      studentPhone = studentDoc.contactInfo?.mobileNumber || '';
    }

    // Fallback/enrich via ECAP API
    if (!studentName || !studentDept) {
      try {
        const ecapData = await fetchStudentFromEcap(cleanRoll);
        if (ecapData) {
          studentName = studentName || ecapData.studentName || '';
          studentDept = studentDept || ecapData.department || ecapData.branch || '';
          studentBranch = studentBranch || ecapData.branch || '';
          studentEmail = studentEmail || ecapData.email || '';
          studentPhone = studentPhone || ecapData.mobile || '';
        }
      } catch (ecapErr) {
        console.warn('ECAP enrich warning during registration:', ecapErr.message);
      }
    }

    // 6. Create Registration Record
    const registration = new ActivityHubRegistration({
      activity: activity._id,
      student: studentId,
      rollNumber: cleanRoll,
      studentName: studentName.trim(),
      department: studentDept.trim(),
      branch: studentBranch.trim(),
      semester: studentSem,
      email: studentEmail.trim(),
      phone: studentPhone.trim(),
      status: 'Registered',
      registeredAt: new Date()
    });

    await registration.save();

    // 7. Update Registration Count on Activity
    activity.registrationCount = (activity.registrationCount || 0) + 1;
    await activity.save();

    return res.status(201).json({
      success: true,
      message: `Successfully registered for "${activity.title}"!`,
      data: registration
    });
  } catch (error) {
    // Catch database duplicate key error (code 11000)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You are already registered for this activity.'
      });
    }
    console.error('Error registering student for activity:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete registration',
      error: error.message
    });
  }
};

/**
 * List Current Student's Registrations
 */
exports.getMyRegistrations = async (req, res) => {
  try {
    const studentId = req.user?.userId;
    const cleanRoll = String(req.user?.institutionId || '').toUpperCase().trim();

    const registrations = await ActivityHubRegistration.find({
      $or: [
        { student: studentId },
        { rollNumber: cleanRoll }
      ]
    })
      .populate('activity')
      .sort({ registeredAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: registrations
    });
  } catch (error) {
    console.error('Error getting my registrations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve your registrations',
      error: error.message
    });
  }
};
