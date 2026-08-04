const express = require('express');
const router = express.Router();
const infrastructureController = require('./Infrastructure.controller');

// Buildings
router.route('/buildings')
    .post(infrastructureController.createBuilding)
    .get(infrastructureController.getBuildings);

router.route('/buildings/:id')
    .put(infrastructureController.updateBuilding)
    .delete(infrastructureController.deleteBuilding);

// Floors
router.route('/floors')
    .post(infrastructureController.createFloor)
    .get(infrastructureController.getFloors);

router.route('/floors/:id')
    .put(infrastructureController.updateFloor)
    .delete(infrastructureController.deleteFloor);

// Grounds
router.route('/grounds')
    .post(infrastructureController.createGround)
    .get(infrastructureController.getGrounds);

router.route('/grounds/:id')
    .put(infrastructureController.updateGround)
    .delete(infrastructureController.deleteGround);

module.exports = router;
