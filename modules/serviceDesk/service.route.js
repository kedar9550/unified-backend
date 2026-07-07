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
  removeServiceAdmin,
  assignServiceEmp,
  getServiceEmps,
  removeServiceEmp,
  getServiceStats,
  getMyMemberships
} = require("./service.controller");

// Every route below needs a logged-in user
router.use(protect);

// Read access — any employee (needed to pick a service while raising a ticket)
router.get("/", getServices);
router.get("/my-memberships", getMyMemberships); // must come before /:id
router.get("/stats", authorize("UNIPRIME"), getServiceStats); // must come before /:id
router.get("/:id", getServiceById);

// Write access — PRIME only
router.post("/", authorize("UNIPRIME"), createService);
router.put("/:id", authorize("UNIPRIME"), updateService);
router.delete("/:id", authorize("UNIPRIME"), deactivateService);

// Service Admin assignment — PRIME only
router.post("/:serviceId/admins", authorize("UNIPRIME"), assignServiceAdmin);
router.get("/:serviceId/admins", authorize("UNIPRIME"), getServiceAdmins);
router.delete("/:serviceId/admins/:employeeId", authorize("UNIPRIME"), removeServiceAdmin);

// Service Emp assignment — Service Admin of that service, or PRIME
// (checked inline in the controller, same pattern as getServiceTickets,
// since a non-PRIME Service Admin still needs access here)
router.post("/:serviceId/emps", assignServiceEmp);
router.get("/:serviceId/emps", getServiceEmps);
router.delete("/:serviceId/emps/:employeeId", removeServiceEmp);

module.exports = router;
