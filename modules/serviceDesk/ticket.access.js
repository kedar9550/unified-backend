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
  console.log(`[hasTicketAccess] Checking access for user ${userId} on ticket ${ticket._id}`);

  const isPrime = (req.user.roles || []).some(r => r.role?.toUpperCase() === "UNIPRIME");
  console.log(`[hasTicketAccess] isPrime: ${isPrime}`);
  if (isPrime) return true;

  const creatorId = (ticket.createdBy?._id || ticket.createdBy)?.toString();
  const isCreator = creatorId === userId;
  console.log(`[hasTicketAccess] isCreator: ${isCreator} (Creator: ${creatorId}, User: ${userId})`);
  if (isCreator) return true;

  const isAssigned = (ticket.assignedTo || []).some(
    a => (a.employee?._id || a.employee)?.toString() === userId
  );
  console.log(`[hasTicketAccess] isAssigned: ${isAssigned}`);
  if (isAssigned) return true;

  const isServiceAdmin = await ServiceMember.exists({
    service: ticket.service?._id || ticket.service,
    employee: userId,
    roleType: "SERVICE_ADMIN",
    isActive: true
  });
  console.log(`[hasTicketAccess] isServiceAdmin: ${!!isServiceAdmin} (Service: ${(ticket.service?._id || ticket.service)})`);

  if (!isServiceAdmin) {
    console.log(`[hasTicketAccess] Access DENIED for user ${userId} on ticket ${ticket._id}`);
  }

  return !!isServiceAdmin;
};

module.exports = { hasTicketAccess };
