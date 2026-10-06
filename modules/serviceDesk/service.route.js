const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../../middlewares/authMiddleware");
const {
  createService,
  getServices,
  getServiceById,
  updateService,
  deactivateService,
  assignServiceAdmin,
  getServiceAdmins,
  updateServiceAdminBlocks,
  removeServiceAdmin,
  assignServiceEmp,
  getServiceEmps,
  removeServiceEmp,
  toggleServiceEmpStatus,
  getServiceStats,
  getMyMemberships
} = require("./service.controller");

// Every route below needs a logged-in user
router.use(protect);

// Read access — any employee (needed to pick a service while raising a ticket)
router.get("/", getServices);
router.get("/my-memberships", getMyMemberships); // must come before /:id
router.get("/stats", authorize("UNIPRIME", "ADMIN", "SUPER_ADMIN", "PRIME", "CSR_ADMIN", "CSR ADMIN", "CSR"), getServiceStats); // must come before /:id
router.get("/:id", getServiceById);

// Write access — PRIME / CSR_ADMIN
router.post("/", authorize("UNIPRIME", "ADMIN", "SUPER_ADMIN", "PRIME", "CSR_ADMIN", "CSR ADMIN", "CSR"), createService);
router.put("/:id", authorize("UNIPRIME", "ADMIN", "SUPER_ADMIN", "PRIME", "CSR_ADMIN", "CSR ADMIN", "CSR"), updateService);
router.delete("/:id", authorize("UNIPRIME", "ADMIN", "SUPER_ADMIN", "PRIME", "CSR_ADMIN", "CSR ADMIN", "CSR"), deactivateService);

// Service Admin assignment — PRIME / CSR_ADMIN
router.post("/:serviceId/admins", authorize("UNIPRIME", "ADMIN", "SUPER_ADMIN", "PRIME", "CSR_ADMIN", "CSR ADMIN", "CSR"), assignServiceAdmin);
router.get("/:serviceId/admins", authorize("UNIPRIME", "ADMIN", "SUPER_ADMIN", "PRIME", "CSR_ADMIN", "CSR ADMIN", "CSR"), getServiceAdmins);
router.put("/:serviceId/admins/:employeeId/blocks", authorize("UNIPRIME", "ADMIN", "SUPER_ADMIN", "PRIME", "CSR_ADMIN", "CSR ADMIN", "CSR"), updateServiceAdminBlocks);
router.delete("/:serviceId/admins/:employeeId", authorize("UNIPRIME", "ADMIN", "SUPER_ADMIN", "PRIME", "CSR_ADMIN", "CSR ADMIN", "CSR"), removeServiceAdmin);

// Service Emp assignment — Service Admin of that service, or PRIME
// (checked inline in the controller, same pattern as getServiceTickets,
// since a non-PRIME Service Admin still needs access here)
router.post("/:serviceId/emps", assignServiceEmp);
router.get("/:serviceId/emps", getServiceEmps);
router.patch("/:serviceId/emps/:employeeId/status", toggleServiceEmpStatus);
router.delete("/:serviceId/emps/:employeeId", removeServiceEmp);

// Manual Field Workers (for services where directEmployeeInvolvement === false)
const workerController = require("./worker.controller");
router.get("/:serviceId/workers", workerController.getServiceWorkers);
router.post("/:serviceId/workers", workerController.createServiceWorker);
router.put("/:serviceId/workers/:workerId", workerController.updateServiceWorker);
router.patch("/:serviceId/workers/:workerId/status", workerController.toggleServiceWorkerStatus);
router.delete("/:serviceId/workers/:workerId", workerController.deleteServiceWorker);

module.exports = router;
