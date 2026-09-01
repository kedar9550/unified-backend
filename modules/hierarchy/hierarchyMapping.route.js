const express = require('express');
const router = express.Router();
const hierarchyController = require('./HierarchyMapping.controller');

// Create/Update mappings
router.post('/employee-to-role', hierarchyController.upsertEmployeeToRole);

// Get mappings
router.get('/employee-to-role', hierarchyController.getEmployeeToRoleMappings);

// Delete mapping
router.delete('/:id', hierarchyController.deleteMapping);

module.exports = router;
