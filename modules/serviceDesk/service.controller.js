const Service = require("./service.model");
const ServiceMember = require("./serviceMember.model");
const Employee = require("../employee/employee.model");
const Role = require("../role/role.model");
const UserAppRole = require("../userAppRole/userAppRole.model");
const NotificationService = require("../notification/notification.service");

const APP_NAME = process.env.APP_NAME || "UNIFIED_SYSTEM";

// ---------------------------------------------------------------------
// Coarse role helpers — SERVICE_ADMIN / SERVICE_EMP are per-service in
// ServiceMember, but the Switch Role dropdown + JWT roles read from the
// shared UserAppRole model. These keep that coarse "is this employee an
// admin/emp SOMEWHERE" marker in sync whenever ServiceMember changes.
// NOTE: like every other role, this only reaches req.user.roles on the
// employee's NEXT login/token refresh — not the current session.
// ---------------------------------------------------------------------

const grantCoarseRole = async (employeeId, roleName) => {
  const role = await Role.findOne({ name: roleName, app: APP_NAME });
  if (!role) return; // shouldn't happen — SERVICE_ADMIN/SERVICE_EMP already seeded via CLI

  const exists = await UserAppRole.findOne({ userId: employeeId, app: APP_NAME, role: role._id });
  if (!exists) {
    await UserAppRole.create({ userId: employeeId, userModel: "Employee", app: APP_NAME, role: role._id });
  }
};

// Only removes the coarse marker once the employee holds NO active
// ServiceMember of that roleType for ANY service (they may still admin/
// emp elsewhere).
const revokeCoarseRoleIfUnused = async (employeeId, roleName, roleType) => {
  const stillHasIt = await ServiceMember.exists({ employee: employeeId, roleType, isActive: true });
  if (stillHasIt) return;

  const role = await Role.findOne({ name: roleName, app: APP_NAME });
  if (!role) return;
  await UserAppRole.findOneAndDelete({ userId: employeeId, app: APP_NAME, role: role._id });
};

// ---------- SERVICE CRUD (PRIME only) ----------

// @desc   Create a new service (e.g. Hardware, Software)
// @route  POST /api/service-desk/services
// @access PRIME
exports.createService = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400);
      return next(new Error("Service name is required"));
    }

    const existing = await Service.findOne({ name: name.trim() });
    if (existing) {
      res.status(400);
      return next(new Error("A service with this name already exists"));
    }

    const service = await Service.create({
      name: name.trim(),
      description,
      createdBy: req.user.userId
    });

    res.status(201).json({ success: true, message: "Service created successfully", data: service });
  } catch (error) {
    next(error);
  }
};

// @desc   List all services
// @route  GET /api/service-desk/services
// @access Any logged-in employee (needed to raise a ticket / pick a service)
exports.getServices = async (req, res, next) => {
  try {
    const onlyActive = req.query.activeOnly !== "false";
    const filter = onlyActive ? { isActive: true } : {};
    const services = await Service.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
};

// @desc   Get one service by id
// @route  GET /api/service-desk/services/:id
exports.getServiceById = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id).lean();
    if (!service) {
      res.status(404);
      return next(new Error("Service not found"));
    }
    res.json({ success: true, data: service });
  } catch (error) {
    next(error);
  }
};

// @desc   Update a service (name/description/isActive)
// @route  PUT /api/service-desk/services/:id
// @access PRIME
exports.updateService = async (req, res, next) => {
  try {
    const { name, description, isActive } = req.body;
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { ...(name && { name: name.trim() }), ...(description !== undefined && { description }), ...(isActive !== undefined && { isActive }) },
      { new: true, runValidators: true }
    );
    if (!service) {
      res.status(404);
      return next(new Error("Service not found"));
    }
    res.json({ success: true, message: "Service updated successfully", data: service });
  } catch (error) {
    next(error);
  }
};

// @desc   Deactivate a service (soft delete — keeps ticket history intact)
// @route  DELETE /api/service-desk/services/:id
// @access PRIME
exports.deactivateService = async (req, res, next) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!service) {
      res.status(404);
      return next(new Error("Service not found"));
    }
    res.json({ success: true, message: "Service deactivated successfully", data: service });
  } catch (error) {
    next(error);
  }
};

// ---------- MY MEMBERSHIPS (any employee — for Service Admin/Emp dashboards) ----------

// @desc   Services the logged-in employee administers and/or works as Service Emp
// @route  GET /api/service-desk/services/my-memberships
// @access Any employee (empty arrays if they hold neither role)
exports.getMyMemberships = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const memberships = await ServiceMember.find({ employee: userId, isActive: true })
      .populate("service", "name description isActive")
      .lean();

    const adminOf = memberships.filter(m => m.roleType === "SERVICE_ADMIN").map(m => m.service);
    const empOf = memberships.filter(m => m.roleType === "SERVICE_EMP").map(m => m.service);

    res.json({ success: true, data: { adminOf, empOf } });
  } catch (error) {
    next(error);
  }
};

// ---------- SERVICE ADMIN ASSIGNMENT (PRIME only) ----------

// @desc   Assign an employee as Service Admin for a service
// @route  POST /api/service-desk/services/:serviceId/admins
// @access PRIME
exports.assignServiceAdmin = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { employeeId } = req.body;

    if (!employeeId) {
      res.status(400);
      return next(new Error("employeeId is required"));
    }

    const [service, employee] = await Promise.all([
      Service.findById(serviceId),
      Employee.findById(employeeId)
    ]);

    if (!service) {
      res.status(404);
      return next(new Error("Service not found"));
    }
    if (!employee) {
      res.status(404);
      return next(new Error("Employee not found"));
    }

    const existing = await ServiceMember.findOne({
      service: serviceId,
      employee: employeeId,
      roleType: "SERVICE_ADMIN"
    });
    if (existing) {
      res.status(400);
      return next(new Error("This employee is already a Service Admin for this service"));
    }

    const member = await ServiceMember.create({
      service: serviceId,
      employee: employeeId,
      roleType: "SERVICE_ADMIN",
      addedBy: req.user.userId
    });

    // Keep the coarse Switch-Role marker in sync (see helpers above)
    await grantCoarseRole(employeeId, "SERVICE_ADMIN");

    // Notify the newly assigned admin using unified's existing notification system
    await NotificationService.sendNotification({
      recipientId: employeeId,
      senderId: req.user.userId,
      module: "ServiceDesk",
      type: "INFO",
      title: "You are now a Service Admin",
      message: `You have been made Service Admin for "${service.name}".`,
      link: `/service-desk/admin/${serviceId}`,
      metadata: { serviceId, targetRole: "SERVICE_ADMIN" }
    });

    res.status(201).json({ success: true, message: "Service Admin assigned successfully", data: member });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400);
      return next(new Error("This employee is already a Service Admin for this service"));
    }
    next(error);
  }
};

// @desc   List Service Admins for a service
// @route  GET /api/service-desk/services/:serviceId/admins
// @access PRIME
exports.getServiceAdmins = async (req, res, next) => {
  try {
    const admins = await ServiceMember.find({
      service: req.params.serviceId,
      roleType: "SERVICE_ADMIN",
      isActive: true
    })
      .populate("employee", "name institutionId email designation")
      .lean();

    res.json({ success: true, data: admins });
  } catch (error) {
    next(error);
  }
};

// @desc   Remove a Service Admin from a service
// @route  DELETE /api/service-desk/services/:serviceId/admins/:employeeId
// @access PRIME
exports.removeServiceAdmin = async (req, res, next) => {
  try {
    const { serviceId, employeeId } = req.params;
    const removed = await ServiceMember.findOneAndDelete({
      service: serviceId,
      employee: employeeId,
      roleType: "SERVICE_ADMIN"
    });
    if (!removed) {
      res.status(404);
      return next(new Error("Service Admin mapping not found"));
    }

    // Only drops the coarse Switch-Role marker if they're not admin of
    // any OTHER service either
    await revokeCoarseRoleIfUnused(employeeId, "SERVICE_ADMIN", "SERVICE_ADMIN");

    res.json({ success: true, message: "Service Admin removed successfully" });
  } catch (error) {
    next(error);
  }
};

// ---------- SERVICE EMP ASSIGNMENT (Service Admin of that service, or PRIME) ----------

// @desc   Assign an employee as Service Emp for a service
// @route  POST /api/service-desk/services/:serviceId/emps
// @access SERVICE_ADMIN of that service, or PRIME
exports.assignServiceEmp = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { employeeId } = req.body;

    const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");
    if (!isPrime) {
      const isAdmin = await ServiceMember.exists({
        service: serviceId, employee: req.user.userId, roleType: "SERVICE_ADMIN", isActive: true
      });
      if (!isAdmin) {
        res.status(403);
        return next(new Error("You are not a Service Admin for this service"));
      }
    }

    if (!employeeId) {
      res.status(400);
      return next(new Error("employeeId is required"));
    }

    const [service, employee] = await Promise.all([
      Service.findById(serviceId),
      Employee.findById(employeeId)
    ]);

    if (!service) {
      res.status(404);
      return next(new Error("Service not found"));
    }
    if (!employee) {
      res.status(404);
      return next(new Error("Employee not found"));
    }

    const existing = await ServiceMember.findOne({
      service: serviceId,
      employee: employeeId,
      roleType: "SERVICE_EMP"
    });
    if (existing) {
      res.status(400);
      return next(new Error("This employee is already a Service Emp for this service"));
    }

    const member = await ServiceMember.create({
      service: serviceId,
      employee: employeeId,
      roleType: "SERVICE_EMP",
      addedBy: req.user.userId
    });

    await grantCoarseRole(employeeId, "SERVICE_EMP");

    await NotificationService.sendNotification({
      recipientId: employeeId,
      senderId: req.user.userId,
      module: "ServiceDesk",
      type: "INFO",
      title: "You are now a Service Emp",
      message: `You have been made Service Emp for "${service.name}".`,
      link: `/service-desk/assigned-to-me`,
      metadata: { serviceId, targetRole: "SERVICE_EMP" }
    });

    res.status(201).json({ success: true, message: "Service Emp assigned successfully", data: member });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400);
      return next(new Error("This employee is already a Service Emp for this service"));
    }
    next(error);
  }
};

// @desc   List Service Emps for a service
// @route  GET /api/service-desk/services/:serviceId/emps
// @access SERVICE_ADMIN of that service, or PRIME
exports.getServiceEmps = async (req, res, next) => {
  try {
    const { serviceId } = req.params;

    const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");
    if (!isPrime) {
      const isAdmin = await ServiceMember.exists({
        service: serviceId, employee: req.user.userId, roleType: "SERVICE_ADMIN", isActive: true
      });
      if (!isAdmin) {
        res.status(403);
        return next(new Error("You are not a Service Admin for this service"));
      }
    }

    const emps = await ServiceMember.find({
      service: serviceId,
      roleType: "SERVICE_EMP",
      isActive: true
    })
      .populate("employee", "name institutionId email designation phone")
      .lean();

    res.json({ success: true, data: emps });
  } catch (error) {
    next(error);
  }
};

// @desc   Remove a Service Emp from a service
// @route  DELETE /api/service-desk/services/:serviceId/emps/:employeeId
// @access SERVICE_ADMIN of that service, or PRIME
exports.removeServiceEmp = async (req, res, next) => {
  try {
    const { serviceId, employeeId } = req.params;

    const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");
    if (!isPrime) {
      const isAdmin = await ServiceMember.exists({
        service: serviceId, employee: req.user.userId, roleType: "SERVICE_ADMIN", isActive: true
      });
      if (!isAdmin) {
        res.status(403);
        return next(new Error("You are not a Service Admin for this service"));
      }
    }

    const removed = await ServiceMember.findOneAndDelete({
      service: serviceId,
      employee: employeeId,
      roleType: "SERVICE_EMP"
    });
    if (!removed) {
      res.status(404);
      return next(new Error("Service Emp mapping not found"));
    }

    await revokeCoarseRoleIfUnused(employeeId, "SERVICE_EMP", "SERVICE_EMP");

    res.json({ success: true, message: "Service Emp removed successfully" });
  } catch (error) {
    next(error);
  }
};

// ---------- DASHBOARD STATS (PRIME) ----------

// @desc   Per-service summary — total tickets, total admins, total emps
// @route  GET /api/service-desk/services/stats
// @access PRIME
exports.getServiceStats = async (req, res, next) => {
  try {
    const Ticket = require("./ticket.model");
    const services = await Service.find().lean();
    if (!services.length) return res.json({ success: true, data: [] });

    const serviceIds = services.map(s => s._id);

    const ticketStats = await Ticket.aggregate([
      { $match: { service: { $in: serviceIds } } },
      { $group: { _id: "$service", totalTickets: { $sum: 1 } } }
    ]);

    const memberStats = await ServiceMember.aggregate([
      { $match: { service: { $in: serviceIds }, isActive: true } },
      { $group: { _id: { service: "$service", roleType: "$roleType" }, count: { $sum: 1 } } }
    ]);

    const ticketMap = Object.fromEntries(ticketStats.map(t => [t._id.toString(), t.totalTickets]));

    const adminCountMap = {};
    const empCountMap = {};
    memberStats.forEach(m => {
      const sid = m._id.service.toString();
      if (m._id.roleType === "SERVICE_ADMIN") adminCountMap[sid] = m.count;
      if (m._id.roleType === "SERVICE_EMP") empCountMap[sid] = m.count;
    });

    const data = services.map(service => ({
      ...service,
      totalTickets: ticketMap[service._id.toString()] || 0,
      totalAdmins: adminCountMap[service._id.toString()] || 0,
      totalEmployees: empCountMap[service._id.toString()] || 0
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
