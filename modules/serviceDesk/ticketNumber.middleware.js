const { v4: uuidv4 } = require("uuid");

// Generates a ticket number BEFORE the ticket is saved to DB, so the
// upload middleware (which runs before the controller) can use it to
// name the attachments folder consistently.
module.exports = (req, res, next) => {
  const shortId = uuidv4().split("-")[0];
  req.ticketNumber = "TKT-" + shortId.toUpperCase();
  next();
};
