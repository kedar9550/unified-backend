const ServiceWorker = require("./serviceWorker.model");
const ServiceMember = require("./serviceMember.model");
const Service = require("./service.model");
const Ticket = require("./ticket.model");

// Helper: Ensure caller is SERVICE_ADMIN for this service
const verifyAdminAccess = async (serviceId, userId) => {
  const isAdmin = await ServiceMember.exists({
    service: serviceId,
    employee: userId,
    roleType: "SERVICE_ADMIN",
    isActive: true
  });
  return Boolean(isAdmin);
};

/**
 * @desc   Get all manual field workers for a service
 * @route  GET /api/service-desk/services/:serviceId/workers
 * @access SERVICE_ADMIN of the service
 */
exports.getServiceWorkers = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { status } = req.query;

    const hasAccess = await verifyAdminAccess(serviceId, req.user.userId);
    if (!hasAccess) {
      res.status(403);
      return next(new Error("Only Service Admins can manage service workers"));
    }

    const filter = { service: serviceId };
    if (status && ["ACTIVE", "INACTIVE"].includes(status.toUpperCase())) {
      filter.status = status.toUpperCase();
    }

    const workers = await ServiceWorker.find(filter)
      .populate("createdBy", "name institutionId")
      .sort({ status: 1, name: 1 })
      .lean();

    // Attach ticket involvement counts to each worker
    const workerIds = workers.map(w => w._id);
    const ticketCounts = await Ticket.aggregate([
      { $match: { "assignedWorkers.worker": { $in: workerIds } } },
      { $unwind: "$assignedWorkers" },
      { $match: { "assignedWorkers.worker": { $in: workerIds } } },
      {
        $group: {
          _id: "$assignedWorkers.worker",
          totalTickets: { $sum: 1 },
          activeTickets: {
            $sum: {
              $cond: [{ $in: ["$status", ["OPEN", "ASSIGNED", "IN_PROGRESS"]] }, 1, 0]
            }
          }
        }
      }
    ]);

    const countsMap = {};
    ticketCounts.forEach(c => {
      countsMap[c._id.toString()] = {
        totalTickets: c.totalTickets,
        activeTickets: c.activeTickets
      };
    });

    const enrichedWorkers = workers.map(w => ({
      ...w,
      totalTickets: countsMap[w._id.toString()]?.totalTickets || 0,
      activeTickets: countsMap[w._id.toString()]?.activeTickets || 0
    }));

    return res.status(200).json({
      success: true,
      data: enrichedWorkers
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Add a new manual field worker (no login generated)
 * @route  POST /api/service-desk/services/:serviceId/workers
 * @access SERVICE_ADMIN of the service
 */
exports.createServiceWorker = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { name, phone, designation, notes } = req.body;

    if (!name || !name.trim()) {
      res.status(400);
      return next(new Error("Worker name is required"));
    }

    const hasAccess = await verifyAdminAccess(serviceId, req.user.userId);
    if (!hasAccess) {
      res.status(403);
      return next(new Error("Only Service Admins can add service workers"));
    }

    const worker = await ServiceWorker.create({
      service: serviceId,
      name: name.trim(),
      phone: (phone || "").trim(),
      designation: (designation || "").trim(),
      notes: (notes || "").trim(),
      status: "ACTIVE",
      createdBy: req.user.userId
    });

    const populated = await ServiceWorker.findById(worker._id).populate("createdBy", "name institutionId");

    return res.status(201).json({
      success: true,
      message: "Field worker added successfully",
      data: populated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Update worker details
 * @route  PUT /api/service-desk/services/:serviceId/workers/:workerId
 * @access SERVICE_ADMIN of the service
 */
exports.updateServiceWorker = async (req, res, next) => {
  try {
    const { serviceId, workerId } = req.params;
    const { name, phone, designation, notes, status } = req.body;

    const hasAccess = await verifyAdminAccess(serviceId, req.user.userId);
    if (!hasAccess) {
      res.status(403);
      return next(new Error("Only Service Admins can edit service workers"));
    }

    const worker = await ServiceWorker.findOne({ _id: workerId, service: serviceId });
    if (!worker) {
      res.status(404);
      return next(new Error("Worker not found"));
    }

    if (name !== undefined) worker.name = name.trim();
    if (phone !== undefined) worker.phone = phone.trim();
    if (designation !== undefined) worker.designation = designation.trim();
    if (notes !== undefined) worker.notes = notes.trim();
    if (status && ["ACTIVE", "INACTIVE"].includes(status.toUpperCase())) {
      worker.status = status.toUpperCase();
    }

    await worker.save();
    const populated = await ServiceWorker.findById(worker._id).populate("createdBy", "name institutionId");

    return res.status(200).json({
      success: true,
      message: "Worker details updated successfully",
      data: populated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Toggle worker Active / Deactivate status
 * @route  PATCH /api/service-desk/services/:serviceId/workers/:workerId/status
 * @access SERVICE_ADMIN of the service
 */
exports.toggleServiceWorkerStatus = async (req, res, next) => {
  try {
    const { serviceId, workerId } = req.params;
    const { status } = req.body;

    const hasAccess = await verifyAdminAccess(serviceId, req.user.userId);
    if (!hasAccess) {
      res.status(403);
      return next(new Error("Only Service Admins can toggle worker status"));
    }

    const worker = await ServiceWorker.findOne({ _id: workerId, service: serviceId });
    if (!worker) {
      res.status(404);
      return next(new Error("Worker not found"));
    }

    let nextStatus = status ? status.toUpperCase() : (worker.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    if (!["ACTIVE", "INACTIVE"].includes(nextStatus)) {
      res.status(400);
      return next(new Error("Invalid status. Allowed: ACTIVE, INACTIVE"));
    }

    worker.status = nextStatus;
    await worker.save();

    return res.status(200).json({
      success: true,
      message: `Worker status changed to ${nextStatus}`,
      data: worker
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Delete worker (ONLY allowed if NOT assigned to any tickets)
 * @route  DELETE /api/service-desk/services/:serviceId/workers/:workerId
 * @access SERVICE_ADMIN of the service
 */
exports.deleteServiceWorker = async (req, res, next) => {
  try {
    const { serviceId, workerId } = req.params;

    const hasAccess = await verifyAdminAccess(serviceId, req.user.userId);
    if (!hasAccess) {
      res.status(403);
      return next(new Error("Only Service Admins can delete workers"));
    }

    const worker = await ServiceWorker.findOne({ _id: workerId, service: serviceId });
    if (!worker) {
      res.status(404);
      return next(new Error("Worker not found"));
    }

    // Check if worker is assigned to any ticket
    const ticketCount = await Ticket.countDocuments({ "assignedWorkers.worker": worker._id });
    if (ticketCount > 0) {
      res.status(400);
      return next(new Error(
        `Cannot delete ${worker.name} because they are linked to ${ticketCount} ticket(s). You can deactivate them instead so they won't be assigned to future requests.`
      ));
    }

    await ServiceWorker.findByIdAndDelete(worker._id);

    return res.status(200).json({
      success: true,
      message: `${worker.name} deleted successfully`
    });
  } catch (error) {
    next(error);
  }
};
