const ServiceMember = require("./serviceMember.model");

/**
 * Returns true if req.user is allowed to view/chat on this ticket:
 *   - the employee who created it
 *   - any employee currently in its assignedTo[] list
 *   - the Service Admin(s) of the ticket's service (checked via ServiceMember)
 *   - PRIME (UNIPRIME) — full visibility everywhere
 *
 * `ticket` must be a Ticket document/lean object (needs createdBy, assignedTo, service).
 */
const hasTicketAccess = async (req, ticket) => {
  const userId = req.user.userId.toString();

  // 1. Fast in-memory check: Assigned employee
  const isAssigned = (ticket.assignedTo || []).some(
    a => (a.employee?._id || a.employee)?.toString() === userId
  );
  if (isAssigned) return true;

  // 2. Fast in-memory check: Ticket creator
  const creatorId = (ticket.createdBy?._id || ticket.createdBy)?.toString();
  if (creatorId && creatorId === userId) return true;

  // 3. Fast in-memory check: UNIPRIME / CSR_ADMIN role
  const isPrime = (req.user.roles || []).some(r => ["UNIPRIME", "CSR_ADMIN", "CSR ADMIN", "CSR", "CSR_ADMINISTRATOR"].includes(r.role?.toUpperCase()));
  if (isPrime) return true;

  // 4. Fallback DB check: Service Admin
  const isServiceAdmin = await ServiceMember.exists({
    service: ticket.service?._id || ticket.service,
    employee: userId,
    roleType: "SERVICE_ADMIN",
    isActive: true
  });

  return !!isServiceAdmin;
};

module.exports = { hasTicketAccess };
