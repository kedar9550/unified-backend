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

  const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");
  if (isPrime) return true;

  const isCreator = ticket.createdBy?.toString() === userId;
  if (isCreator) return true;

  const isAssigned = (ticket.assignedTo || []).some(
    a => a.employee?.toString() === userId
  );
  if (isAssigned) return true;

  const isServiceAdmin = await ServiceMember.exists({
    service: ticket.service,
    employee: userId,
    roleType: "SERVICE_ADMIN",
    isActive: true
  });

  return !!isServiceAdmin;
};

module.exports = { hasTicketAccess };
