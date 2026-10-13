const express = require('express');
const router = express.Router();

const eventsRoutes = require('./Events/events.route');
const eventTypesRoutes = require('./EventTypes/eventTypes.route');
const eventCategoriesRoutes = require('./EventCategories/eventCategories.route');
const eventRegistrationsRoutes = require('./EventRegistrations/eventRegistrations.route');
const eventPaymentsRoutes = require('./EventPayments/eventPayments.route');
const universityDataRoutes = require('./UniversityData/universityData.routes');
const organisationCommitteeRoutes = require('./OrganisationCommittee/CentralEventOrganisationCommittee.route');

// Aggregate all CentralEvents sub-routes into single CentralEvents router
router.use('/central-events/organisation-committee', organisationCommitteeRoutes);
router.use('/university-data', universityDataRoutes);
router.use('/', eventTypesRoutes);
router.use('/', eventCategoriesRoutes);
router.use('/', eventRegistrationsRoutes);
router.use('/', eventPaymentsRoutes);
router.use('/', eventsRoutes);

module.exports = router;
